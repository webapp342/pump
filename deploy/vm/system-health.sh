#!/usr/bin/env bash
# VM system health — machine-internal probes. Outputs JSON to stdout.
# Usage: deploy/vm/system-health.sh
set -uo pipefail

APP_DIR="${APP_DIR:-/var/www/pump/tma}"
LOG_LINES="${LOG_LINES:-8}"
CHECKS_FILE="$(mktemp)"
HOST_METRICS_FILE="$(mktemp)"
trap 'rm -f "$CHECKS_FILE" "$HOST_METRICS_FILE"' EXIT

now_ms_fn() {
  date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))'
}

SCRIPT_STARTED_MS="$(now_ms_fn)"

# Run command; print elapsed ms to stdout.
time_ms() {
  local start end
  start="$(now_ms_fn)"
  "$@" >/dev/null 2>&1
  end="$(now_ms_fn)"
  echo "$((end - start))"
}

curl_time_ms() {
  local url="$1"
  local out
  out="$(curl -sf -o /dev/null -w '%{time_total}' --connect-timeout 3 --max-time 8 "$url" 2>/dev/null || true)"
  if [[ -z "$out" ]]; then
    echo ""
    return 1
  fi
  MS_VAL="$out" node -e 'process.stdout.write(String(Math.round(Number(process.env.MS_VAL)*1000)))'
}

port_listening() {
  ss -tln 2>/dev/null | grep -q ":$1 "
}

pm2_field() {
  local app="$1" field="$2"
  pm2 jlist 2>/dev/null | node -e "
    const fs = require('fs');
    const field = process.argv[1];
    const appName = process.argv[2];
    const apps = JSON.parse(fs.readFileSync(0, 'utf8') || '[]');
    const app = apps.find((a) => a.name === appName);
    if (!app) { process.stdout.write('missing'); process.exit(0); }
    if (field === 'status') process.stdout.write(String(app.pm2_env?.status ?? 'unknown'));
    else if (field === 'pid') process.stdout.write(String(app.pid ?? ''));
    else process.stdout.write('');
  " "$field" "$app" 2>/dev/null || echo "unknown"
}

service_logs() {
  journalctl -u "$1" -n "$LOG_LINES" --no-pager -o cat 2>/dev/null || true
}

pm2_logs() {
  pm2 logs "$1" --lines "$LOG_LINES" --nostream 2>/dev/null | tail -n "$((LOG_LINES * 2))" || true
}

logs_to_json() {
  LOG_CONTENT="$1" node -e 'process.stdout.write(JSON.stringify((process.env.LOG_CONTENT||"").split("\n").filter(Boolean)))'
}

make_timings() {
  TIMINGS_DATA="$1" node -e 'process.stdout.write(process.env.TIMINGS_DATA || "{}")'
}

append_check() {
  HC_OUT="$CHECKS_FILE" \
  HC_ID="$1" \
  HC_NAME="$2" \
  HC_STATUS="$3" \
  HC_SUMMARY="$4" \
  HC_PROBE="$5" \
  HC_DETAIL="$6" \
  HC_LATENCY="$7" \
  HC_LOGS="${8:-[]}" \
  HC_TIMINGS="${9:-}" \
  node -e '
    const fs = require("fs");
    const check = {
      id: process.env.HC_ID,
      name: process.env.HC_NAME,
      status: process.env.HC_STATUS,
      summary: process.env.HC_SUMMARY,
      probe: process.env.HC_PROBE,
      detail: process.env.HC_DETAIL || undefined,
      latencyMs: process.env.HC_LATENCY ? Number(process.env.HC_LATENCY) : undefined,
      logs: JSON.parse(process.env.HC_LOGS || "[]"),
      timings: process.env.HC_TIMINGS ? JSON.parse(process.env.HC_TIMINGS) : undefined,
    };
    fs.appendFileSync(process.env.HC_OUT, JSON.stringify(check) + "\n");
  '
}

collect_host_metrics() {
  HC_OUT="$HOST_METRICS_FILE" node -e '
    const fs = require("fs");
    const { execSync } = require("child_process");

    function sh(cmd) {
      try { return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim(); }
      catch { return ""; }
    }

    const disks = [];
    for (const line of sh("df -h -x tmpfs -x devtmpfs -x squashfs --output=source,size,used,avail,pcent,target 2>/dev/null").split("\n").slice(1)) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const [filesystem, size, used, avail, pcent, ...rest] = parts;
      disks.push({ filesystem, size, used, avail, usePercent: pcent, mountedOn: rest.join(" ") });
    }

    const memLine = sh("free -m | awk \"/^Mem:/ {print \\$2, \\$3, \\$4, \\$7}\"");
    const [totalMb, usedMb, freeMb, availMb] = memLine.split(/\s+/).map(Number);
    const memUsedPct = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;

    const loadParts = sh("cat /proc/loadavg").split(/\s+/);
    const cores = Number(sh("nproc")) || 1;
    const load1 = Number(loadParts[0]) || 0;
    const load5 = Number(loadParts[1]) || 0;
    const load15 = Number(loadParts[2]) || 0;

    let cpuUsagePct = null;
    const topLine = sh("top -bn1 | grep -E \"%Cpu|Cpu\\(s\\)\" | head -1");
    const idleMatch = topLine.match(/([0-9.]+)\s*id/);
    if (idleMatch) cpuUsagePct = Math.round(100 - Number(idleMatch[1]));

    const uptime = sh("uptime -p 2>/dev/null") || sh("uptime");

    fs.writeFileSync(process.env.HC_OUT, JSON.stringify({
      disk: disks,
      memory: {
        totalMb: totalMb || 0,
        usedMb: usedMb || 0,
        freeMb: freeMb || 0,
        availableMb: availMb || 0,
        usedPercent: memUsedPct,
      },
      cpu: {
        cores,
        usagePercent: cpuUsagePct,
        load1,
        load5,
        load15,
        loadPercent1: Math.round((load1 / cores) * 100),
      },
      uptime,
    }));
  '
}

collect_host_metrics

# --- PostgreSQL ---
probe="pg_isready + SELECT 1"
started_pg="$(now_ms_fn)"
pg_ready_ms="$(time_ms pg_isready -q || true)"
select_started="$(now_ms_fn)"
select_ok="no"
if sudo -u postgres psql -d pump_db -tAc "SELECT 1" 2>/dev/null | grep -q 1; then select_ok="yes"; fi
select_ms=$(( $(now_ms_fn) - select_started ))
total_ms=$(( $(now_ms_fn) - started_pg ))
timings_json="$(make_timings "{\"pg_isready\":${pg_ready_ms},\"select1\":${select_ms},\"total\":${total_ms}}")"
if [[ "$select_ok" == "yes" ]]; then
  indexer_row="$(sudo -u postgres psql -d pump_db -tAc "SELECT key || '|' || last_block_number || '|' || updated_at FROM indexer_state ORDER BY updated_at DESC LIMIT 1" 2>/dev/null || true)"
  append_check "postgres" "PostgreSQL" "healthy" "SELECT 1 OK · ${select_ms}ms" "$probe" "indexer_state: ${indexer_row:-n/a}" "$select_ms" "[]" "$timings_json"
else
  logs_json="$(logs_to_json "$(journalctl -u postgresql -n "$LOG_LINES" --no-pager -o cat 2>/dev/null || true)")"
  append_check "postgres" "PostgreSQL" "down" "Database query failed · ${select_ms}ms" "$probe" "pg_isready=${pg_ready_ms}ms" "$select_ms" "$logs_json" "$timings_json"
fi

# --- Redis ---
probe="redis-cli PING"
ping_started="$(now_ms_fn)"
redis_out="$(redis-cli ping 2>/dev/null || true)"
ping_ms=$(( $(now_ms_fn) - ping_started ))
timings_json="$(make_timings "{\"ping\":${ping_ms}}")"
if [[ "$redis_out" == "PONG" ]]; then
  append_check "redis" "Redis" "healthy" "PONG · ${ping_ms}ms" "$probe" "" "$ping_ms" "[]" "$timings_json"
else
  logs_json="$(logs_to_json "$(journalctl -u redis-server -n "$LOG_LINES" --no-pager -o cat 2>/dev/null || true)")"
  append_check "redis" "Redis" "down" "No PONG · ${ping_ms}ms" "$probe" "${redis_out:-no response}" "$ping_ms" "$logs_json" "$timings_json"
fi

# --- Nginx HTTP ---
probe="GET http://127.0.0.1/api/health"
nginx_active="$(systemctl is-active nginx 2>/dev/null || echo inactive)"
http_ms="$(curl_time_ms http://127.0.0.1/api/health || true)"
timings_json="$(make_timings "{\"http\":${http_ms:-null}}")"
if [[ "$nginx_active" == "active" && -n "$http_ms" ]]; then
  append_check "nginx" "Nginx gateway" "healthy" "HTTP ${http_ms}ms · systemctl active" "$probe" "" "$http_ms" "[]" "$timings_json"
else
  logs_json="$(logs_to_json "$(service_logs nginx)")"
  append_check "nginx" "Nginx gateway" "down" "HTTP probe failed" "$probe" "systemctl=$nginx_active" "${http_ms:-0}" "$logs_json" "$timings_json"
fi

# --- TMA ---
probe="GET http://127.0.0.1:3012/api/health"
pm2_status="$(pm2_field pump-tma status)"
pm2_pid="$(pm2_field pump-tma pid)"
logs_json="$(logs_to_json "$(pm2_logs pump-tma)")"
http_ms="$(curl_time_ms http://127.0.0.1:3012/api/health || true)"
listening="no"; port_listening 3012 && listening="yes"
timings_json="$(make_timings "{\"http\":${http_ms:-null}}")"
if [[ -n "$http_ms" && "$listening" == "yes" ]]; then
  append_check "pump_tma" "TMA (Next.js)" "healthy" "HTTP ${http_ms}ms · port 3012 up" "$probe" "pm2=$pm2_status pid=$pm2_pid" "$http_ms" "$logs_json" "$timings_json"
elif [[ "$pm2_status" == "online" && "$listening" == "no" ]]; then
  append_check "pump_tma" "TMA (Next.js)" "down" "PM2 online · port 3012 closed" "$probe" "pm2=$pm2_status pid=$pm2_pid" "0" "$logs_json" "$timings_json"
else
  append_check "pump_tma" "TMA (Next.js)" "down" "HTTP probe failed" "$probe" "pm2=$pm2_status port3012=$listening" "${http_ms:-0}" "$logs_json" "$timings_json"
fi

# --- Realtime ---
probe="GET http://127.0.0.1:3013"
pm2_status="$(pm2_field pump-realtime status)"
dist_ok="no"; [[ -f "$APP_DIR/apps/realtime/dist/server.js" ]] && dist_ok="yes"
logs_json="$(logs_to_json "$(pm2_logs pump-realtime)")"
http_ms="$(curl_time_ms http://127.0.0.1:3013 || true)"
listening="no"; port_listening 3013 && listening="yes"
timings_json="$(make_timings "{\"http\":${http_ms:-null}}")"
if [[ -n "$http_ms" && "$listening" == "yes" && "$dist_ok" == "yes" ]]; then
  append_check "pump_realtime" "Realtime (WS srv)" "healthy" "HTTP ${http_ms}ms · dist OK" "$probe" "pm2=$pm2_status" "$http_ms" "$logs_json" "$timings_json"
elif [[ "$pm2_status" == "online" && ( "$listening" == "no" || "$dist_ok" == "no" ) ]]; then
  append_check "pump_realtime" "Realtime (WS srv)" "down" "PM2 online · not serving" "$probe" "pm2=$pm2_status dist=$dist_ok port3013=$listening" "0" "$logs_json" "$timings_json"
else
  append_check "pump_realtime" "Realtime (WS srv)" "down" "HTTP probe failed" "$probe" "pm2=$pm2_status dist=$dist_ok" "${http_ms:-0}" "$logs_json" "$timings_json"
fi

# --- Alto bundler (EVM SCW only — skipped when CHAIN_FAMILY=solana) ---
CHAIN_FAMILY="$(grep -E '^NEXT_PUBLIC_CHAIN_FAMILY=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
CHAIN_FAMILY="${CHAIN_FAMILY:-$(grep -E '^CHAIN_FAMILY=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)}"
if [[ "${CHAIN_FAMILY,,}" == "solana" ]]; then
  append_check "pump_alto" "Alto bundler" "healthy" "skipped · Solana cutover (no ERC-4337)" "n/a" "CHAIN_FAMILY=solana" "0" "[]" "{}"
else
  BUNDLER_RPC="${BUNDLER_RPC_URL:-http://127.0.0.1:4337/rpc}"
  probe="POST ${BUNDLER_RPC} eth_chainId"
  pm2_status="$(pm2_field pump-alto status)"
  logs_json="$(logs_to_json "$(pm2_logs pump-alto)")"
  listening="no"; port_listening 4337 && listening="yes"
  alto_started="$(now_ms_fn)"
  alto_out="$(curl -sf -X POST "$BUNDLER_RPC" \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null || true)"
  alto_ms=$(( $(now_ms_fn) - alto_started ))
  timings_json="$(make_timings "{\"rpc\":${alto_ms}}")"
  if [[ -n "$alto_out" && "$alto_out" == *"result"* ]]; then
    append_check "pump_alto" "Alto bundler" "healthy" "RPC OK · ${alto_ms}ms · port 4337" "$probe" "pm2=$pm2_status" "$alto_ms" "$logs_json" "$timings_json"
  elif [[ "$pm2_status" == "online" && "$listening" == "yes" ]]; then
    append_check "pump_alto" "Alto bundler" "degraded" "PM2 online · RPC failed · ${alto_ms}ms" "$probe" "${alto_out:-no response}" "$alto_ms" "$logs_json" "$timings_json"
  else
    append_check "pump_alto" "Alto bundler" "down" "SCW create/trade 502 until Alto runs" "$probe" "pm2=$pm2_status port4337=$listening" "$alto_ms" "$logs_json" "$timings_json"
  fi
fi

# --- WebSocket (realtime backend — direct; nginx /ws proxies here) ---
WS_SMOKE_URL="${WS_SMOKE_URL:-ws://127.0.0.1:3013}"
probe="ws-smoke → ${WS_SMOKE_URL}"
ws_started="$(now_ms_fn)"
ws_out=""
if [[ -f "$APP_DIR/scripts/load/ws-smoke.mjs" ]]; then
  ws_out="$(cd "$APP_DIR/apps/realtime" && node ../../scripts/load/ws-smoke.mjs --connections 1 --url "$WS_SMOKE_URL" 2>&1 || true)"
fi
ws_ms=$(( $(now_ms_fn) - ws_started ))
ws_elapsed="$(echo "$ws_out" | grep -o '"elapsedMs":[0-9]*' | head -1 | cut -d: -f2)"
timings_json="$(make_timings "{\"connect\":${ws_ms},\"smokeReport\":${ws_elapsed:-null}}")"
logs_json="$(logs_to_json "$(echo "$ws_out" | tail -n 8)")"
if echo "$ws_out" | grep -q '"failed": 0'; then
  append_check "websocket" "WebSocket (realtime)" "healthy" "Connect OK · ${ws_ms}ms · nginx /ws → :3013" "$probe" "$(echo "$ws_out" | tail -1)" "$ws_ms" "$logs_json" "$timings_json"
else
  append_check "websocket" "WebSocket (realtime)" "down" "Smoke test failed · ${ws_ms}ms" "$probe" "$(echo "$ws_out" | tail -3 | tr '\n' ' ')" "$ws_ms" "$logs_json" "$timings_json"
fi

# --- Indexer (EVM) ---
if [[ "${CHAIN_FAMILY,,}" == "solana" ]]; then
  append_check "pump_indexer" "Indexer (EVM)" "healthy" "skipped · Solana cutover" "n/a" "CHAIN_FAMILY=solana" "0" "[]" "{}"
else
  probe="systemctl + indexer_state query"
  logs_json="$(logs_to_json "$(service_logs pump-indexer)")"
  idx_started="$(now_ms_fn)"
  idx_active="$(systemctl is-active pump-indexer 2>/dev/null || echo inactive)"
  systemctl_ms=$(( $(now_ms_fn) - idx_started ))
  query_started="$(now_ms_fn)"
  indexer_info="$(sudo -u postgres psql -d pump_db -tAc "SELECT key, last_block_number, EXTRACT(EPOCH FROM (now()-updated_at))::int FROM indexer_state ORDER BY updated_at DESC LIMIT 1" 2>/dev/null | tr '|' ' ' || true)"
  indexer_mode="$(journalctl -u pump-indexer -n 80 --no-pager 2>/dev/null | grep 'launchpad indexer ready' | tail -1 | sed -n 's/.*mode=\([^,]*\).*/\1/p' || true)"
  indexer_detail="${indexer_info}${indexer_mode:+ · mode=${indexer_mode}}"
  query_ms=$(( $(now_ms_fn) - query_started ))
  timings_json="$(make_timings "{\"systemctl\":${systemctl_ms},\"dbQuery\":${query_ms}}")"
  if [[ "$idx_active" == "active" ]]; then
    age="$(echo "$indexer_info" | awk '{print $NF}')"
    status="healthy"; summary="active · db query ${query_ms}ms${indexer_mode:+ · ${indexer_mode}}"
    if [[ -n "$age" && "$age" -gt 600 ]]; then status="down"; summary="stale ${age}s · db ${query_ms}ms"; fi
    if [[ -n "$age" && "$age" -gt 180 && "$age" -le 600 ]]; then status="degraded"; summary="slow ${age}s · db ${query_ms}ms"; fi
    if [[ -z "$indexer_mode" ]]; then
      status="degraded"
      summary="active · missing mode= in log (run indexer-deploy)"
    fi
    append_check "pump_indexer" "Indexer" "$status" "$summary" "$probe" "$indexer_detail" "$query_ms" "$logs_json" "$timings_json"
  else
    append_check "pump_indexer" "Indexer" "down" "systemd=$idx_active" "$probe" "$indexer_info" "$query_ms" "$logs_json" "$timings_json"
  fi
fi

# --- Solana indexer (production) ---
probe="systemctl + indexer_state solana"
logs_json="$(logs_to_json "$(service_logs pump-indexer-sol)")"
idx_sol_started="$(now_ms_fn)"
idx_sol_active="$(systemctl is-active pump-indexer-sol 2>/dev/null || echo inactive)"
systemctl_ms=$(( $(now_ms_fn) - idx_sol_started ))
query_started="$(now_ms_fn)"
indexer_sol_info="$(sudo -u postgres psql -d pump_db -tAc "SELECT key, last_block_number, EXTRACT(EPOCH FROM (now()-updated_at))::int FROM indexer_state WHERE key LIKE 'solana%' ORDER BY updated_at DESC LIMIT 1" 2>/dev/null | tr '|' ' ' || true)"
query_ms=$(( $(now_ms_fn) - query_started ))
timings_json="$(make_timings "{\"systemctl\":${systemctl_ms},\"dbQuery\":${query_ms}}")"
if [[ "$idx_sol_active" == "active" ]]; then
  age="$(echo "$indexer_sol_info" | awk '{print $NF}')"
  status="healthy"; summary="active · db query ${query_ms}ms"
  if [[ -n "$age" && "$age" -gt 600 ]]; then status="down"; summary="stale ${age}s · db ${query_ms}ms"; fi
  if [[ -n "$age" && "$age" -gt 180 && "$age" -le 600 ]]; then status="degraded"; summary="slow ${age}s · db ${query_ms}ms"; fi
  append_check "pump_indexer_sol" "Indexer (Solana)" "$status" "$summary" "$probe" "${indexer_sol_info:-n/a}" "$query_ms" "$logs_json" "$timings_json"
elif [[ "${CHAIN_FAMILY,,}" == "solana" ]]; then
  append_check "pump_indexer_sol" "Indexer (Solana)" "down" "systemd=$idx_sol_active · required on Solana" "$probe" "${indexer_sol_info:-n/a}" "$query_ms" "$logs_json" "$timings_json"
else
  append_check "pump_indexer_sol" "Indexer (Solana)" "healthy" "skipped · EVM chain" "$probe" "${indexer_sol_info:-n/a}" "$query_ms" "$logs_json" "$timings_json"
fi

# --- Airdrop keeper ---
if [[ "${CHAIN_FAMILY,,}" == "solana" ]]; then
  append_check "pump_airdrop_keeper" "Airdrop keeper" "healthy" "skipped · Solana cutover" "n/a" "CHAIN_FAMILY=solana" "0" "[]" "{}"
else
  probe="systemctl is-active pump-airdrop-keeper"
  logs_json="$(logs_to_json "$(service_logs pump-airdrop-keeper)")"
  keeper_started="$(now_ms_fn)"
  keeper_active="$(systemctl is-active pump-airdrop-keeper 2>/dev/null || echo inactive)"
  keeper_ms=$(( $(now_ms_fn) - keeper_started ))
  timings_json="$(make_timings "{\"systemctl\":${keeper_ms}}")"
  if [[ "$keeper_active" == "active" ]]; then
    append_check "pump_airdrop_keeper" "Airdrop keeper" "healthy" "active · ${keeper_ms}ms" "$probe" "" "$keeper_ms" "$logs_json" "$timings_json"
  else
    append_check "pump_airdrop_keeper" "Airdrop keeper" "down" "systemd=$keeper_active · ${keeper_ms}ms" "$probe" "" "$keeper_ms" "$logs_json" "$timings_json"
  fi
fi

# --- Static assets ---
probe="ls .next/standalone/static/chunks"
ls_started="$(now_ms_fn)"
chunk_count="$(ls "$APP_DIR/apps/web/.next/standalone/apps/web/.next/static/chunks/" 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$chunk_count" == "0" ]]; then
  chunk_count="$(ls "$APP_DIR/apps/web/.next/standalone/.next/static/chunks/" 2>/dev/null | wc -l | tr -d ' ')"
fi
ls_ms=$(( $(now_ms_fn) - ls_started ))
timings_json="$(make_timings "{\"ls\":${ls_ms}}")"
if [[ "${chunk_count:-0}" -gt 0 ]]; then
  append_check "static_assets" "Static assets" "healthy" "${chunk_count} chunks · ${ls_ms}ms" "$probe" "" "$ls_ms" "[]" "$timings_json"
else
  append_check "static_assets" "Static assets" "down" "missing chunks · ${ls_ms}ms" "$probe" "run tma-deploy.sh" "$ls_ms" "[]" "$timings_json"
fi

# --- ClickHouse (optional OLAP) ---
CH_URL="$(grep -E '^CLICKHOUSE_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
CH_URL="${CH_URL:-http://127.0.0.1:8123}"
probe="GET ${CH_URL}/ping"
ch_started="$(now_ms_fn)"
ch_out="$(curl -sf "${CH_URL}/ping" 2>/dev/null || true)"
ch_ms=$(( $(now_ms_fn) - ch_started ))
timings_json="$(make_timings "{\"ping\":${ch_ms}}")"
if [[ "$ch_out" == "Ok." || "$ch_out" == *"Ok"* ]]; then
  append_check "clickhouse" "ClickHouse OLAP" "healthy" "ping OK · ${ch_ms}ms" "$probe" "$ch_out" "$ch_ms" "[]" "$timings_json"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pump-clickhouse$'; then
  append_check "clickhouse" "ClickHouse OLAP" "degraded" "container up · ping failed · ${ch_ms}ms" "$probe" "run enable-clickhouse.sh" "$ch_ms" "[]" "$timings_json"
else
  append_check "clickhouse" "ClickHouse OLAP" "healthy" "not running · optional until enable-clickhouse.sh" "$probe" "skipped" "0" "[]" "{}"
fi

SCRIPT_ENDED_MS="$(now_ms_fn)"
SCRIPT_DURATION_MS=$(( SCRIPT_ENDED_MS - SCRIPT_STARTED_MS ))

HC_CHECKS="$CHECKS_FILE" HC_HOST="$HOST_METRICS_FILE" HC_SCRIPT_MS="$SCRIPT_DURATION_MS" node -e '
const fs = require("fs");
const lines = fs.readFileSync(process.env.HC_CHECKS, "utf8").trim().split("\n").filter(Boolean);
const checks = lines.map((line) => JSON.parse(line));
const hostMetrics = JSON.parse(fs.readFileSync(process.env.HC_HOST, "utf8"));
let overall = "healthy";
for (const c of checks) {
  if (c.status === "down") overall = "down";
  else if (c.status === "degraded" && overall !== "down") overall = "degraded";
}
process.stdout.write(JSON.stringify({
  overall,
  checkedAt: new Date().toISOString(),
  host: require("os").hostname(),
  scriptDurationMs: Number(process.env.HC_SCRIPT_MS),
  hostMetrics,
  checks,
}));
'
