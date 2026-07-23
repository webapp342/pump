# Local Solana + guncelleme audit (PowerShell)
# Usage: cd C:\Users\DARK\Desktop\pump-tma; .\deploy\vm\local-audit.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path "$Root\package.json") { Set-Location $Root }

Write-Host "`n========== LOCAL AUDIT ==========" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Date: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"

function Get-EnvVal($file, $key) {
  if (-not (Test-Path $file)) { return $null }
  $line = Select-String -Path $file -Pattern "^\s*$key=" | Select-Object -Last 1
  if (-not $line) { return $null }
  ($line.Line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

$webEnv = Join-Path $Root ".env"
$idxEnv = Join-Path $Root "apps\indexer-sol\.env"

Write-Host "`n--- CHAIN ---"
$cf = Get-EnvVal $webEnv "NEXT_PUBLIC_CHAIN_FAMILY"
Write-Host "NEXT_PUBLIC_CHAIN_FAMILY=$cf"
if ($cf -eq "solana") { Write-Host "OK: Solana" -ForegroundColor Green }
else { Write-Host "WARN: set solana" -ForegroundColor Yellow }

$evmPatterns = @(
  "BUNDLER_", "ALTO_", "SKANDHA_", "NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_TRADE_", "NEXT_PUBLIC_FLASHBLOCKS", "NEXT_PUBLIC_MEME_",
  "NEXT_PUBLIC_BONDING_", "NEXT_PUBLIC_AIRDROP_", "ZERO_DEV", "KERNEL", "PAYMASTER"
)

Write-Host "`n--- ENV FILES ---"
foreach ($f in @($webEnv, $idxEnv)) {
  if (-not (Test-Path $f)) { Write-Host "MISSING: $f"; continue }
  Write-Host "`n$file ($(@(Get-Content $f).Count) lines)"
  Get-Content $f | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -match "^\s*$") { return }
    if ($_ -match "^([A-Za-z_][A-Za-z0-9_]*)=") {
      $k = $Matches[1]
      $tag = "[REVIEW]"
      if ($k -match "SOLANA|CHAIN_FAMILY") { $tag = "[SOLANA-OK]" }
      elseif ($evmPatterns | Where-Object { $k -like "*$_*" }) { $tag = "[EVM-REMOVE]" }
      elseif ($k -match "^(REDIS_|CLICKHOUSE_|USE_|SKIP_)") { $tag = "[GUNCELLEME]" }
      elseif ($k -match "^(DATABASE_|LAUNCHPAD_|AUTH_|TELEGRAM_|NEXT_PUBLIC_WS|R2_|WALLET_)") { $tag = "[CORE-OK]" }
      Write-Host "  $tag $k"
    }
  }
}

Write-Host "`n--- GUNCELLEME FLAGS ---"
@(
  "USE_CLICKHOUSE_CANDLES", "CLICKHOUSE_URL", "REDIS_URL", "USE_REDIS_WEEKLY_XP",
  "NEXT_PUBLIC_WS_ENABLED", "NEXT_PUBLIC_WS_URL", "SKIP_ALTO_BUNDLER"
) | ForEach-Object {
  $v = Get-EnvVal $webEnv $_
  if ($v) { Write-Host "  $_=$v" }
}

Write-Host "`n--- TUNNEL PROBES (optional) ---"
try { Write-Host "CH ping: $(curl.exe -s http://127.0.0.1:18123/ping)" } catch { Write-Host "CH: tunnel kapali" }
try { Write-Host "Redis: $(redis-cli -u redis://127.0.0.1:16379 PING 2>$null)" } catch { Write-Host "Redis: tunnel kapali veya redis-cli yok" }

Write-Host "`n--- GIT ---"
if (Test-Path ".git") { git log -1 --oneline }

Write-Host "`n--- FAZ (local dev) ---"
Write-Host @"
F0 CH: tunnel 18123 + USE_CLICKHOUSE_CANDLES
F1 XP: USE_REDIS_WEEKLY_XP + REDIS tunnel 16379
F2-F6: VM prod (local sadece kod)
F7: price worker VM'de
(parity gate iptal)
"@

Write-Host "`nBitti — VM icin: bash deploy/vm/solana-only-audit.sh" -ForegroundColor Cyan
