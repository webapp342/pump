# Local Solana + guncelleme audit (PowerShell)
# Usage: cd C:\Users\DARK\Desktop\pump-tma; powershell -ExecutionPolicy Bypass -File .\deploy\vm\local-audit.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path "$Root\package.json") { Set-Location $Root }

Write-Host ""
Write-Host "========== LOCAL AUDIT ==========" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host "Date: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"

function Get-EnvVal($file, $key) {
  if (-not (Test-Path $file)) { return $null }
  $line = Select-String -Path $file -Pattern "^\s*$key=" | Select-Object -Last 1
  if (-not $line) { return $null }
  ($line.Line -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

function Test-EvmKey($key) {
  if ($key -in @("SKIP_ALTO_BUNDLER", "SKIP_EVM_INDEXER")) { return $false }
  $evmPatterns = @(
    "BUNDLER_", "ALTO_", "SKANDHA_", "NEXT_PUBLIC_CHAIN_ID", "NEXT_PUBLIC_RPC_URL",
    "NEXT_PUBLIC_TRADE_", "NEXT_PUBLIC_FLASHBLOCKS", "NEXT_PUBLIC_MEME_",
    "NEXT_PUBLIC_BONDING_", "NEXT_PUBLIC_AIRDROP_", "ZERO_DEV", "KERNEL", "PAYMASTER"
  )
  foreach ($p in $evmPatterns) {
    if ($key -like "*$p*") { return $true }
  }
  return $false
}

$webEnv = Join-Path $Root ".env"
$idxEnv = Join-Path $Root "apps\indexer-sol\.env"

Write-Host ""
Write-Host "--- CHAIN ---"
$cf = Get-EnvVal $webEnv "NEXT_PUBLIC_CHAIN_FAMILY"
Write-Host "NEXT_PUBLIC_CHAIN_FAMILY=$cf"
if ($cf -eq "solana") { Write-Host "OK: Solana" -ForegroundColor Green }
else { Write-Host "WARN: set solana" -ForegroundColor Yellow }

Write-Host ""
Write-Host "--- ENV FILES ---"
foreach ($f in @($webEnv, $idxEnv)) {
  if (-not (Test-Path $f)) { Write-Host "MISSING: $f"; continue }
  $lines = @(Get-Content $f).Count
  Write-Host ""
  Write-Host "$f ($lines lines)"
  Get-Content $f | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -match "^\s*$") { return }
    if ($_ -match "^([A-Za-z_][A-Za-z0-9_]*)=") {
      $k = $Matches[1]
      $tag = "[REVIEW]"
      if ($k -match "SOLANA|CHAIN_FAMILY") { $tag = "[SOLANA-OK]" }
      elseif (Test-EvmKey $k) { $tag = "[EVM-REMOVE]" }
      elseif ($k -match "^(REDIS_|CLICKHOUSE_|USE_|SKIP_)") { $tag = "[GUNCELLEME]" }
      elseif ($k -match "^(DATABASE_|LAUNCHPAD_|AUTH_|TELEGRAM_|NEXT_PUBLIC_WS|R2_|WALLET_)") { $tag = "[CORE-OK]" }
      Write-Host "  $tag $k"
    }
  }
}

Write-Host ""
Write-Host "--- GUNCELLEME FLAGS ---"
@(
  "USE_CLICKHOUSE_CANDLES", "CLICKHOUSE_URL", "REDIS_URL", "USE_REDIS_WEEKLY_XP",
  "NEXT_PUBLIC_WS_ENABLED", "NEXT_PUBLIC_WS_URL", "SKIP_ALTO_BUNDLER"
) | ForEach-Object {
  $v = Get-EnvVal $webEnv $_
  if ($v) { Write-Host "  $_=$v" }
}

Write-Host ""
Write-Host "--- TUNNEL PROBES ---"
try {
  Write-Host "CH ping: $(curl.exe -s http://127.0.0.1:18123/ping)"
  Write-Host "CH candles_spot: $(curl.exe -s 'http://127.0.0.1:18123/?query=SELECT%20count()%20FROM%20pump.candles_spot')"
} catch { Write-Host "CH: tunnel kapali" }

try {
  $redisPing = node -e "const n=require('net');const s=n.createConnection(16379,'127.0.0.1');s.on('connect',()=>{console.log('OPEN');s.end()});s.on('error',()=>{console.log('CLOSED');process.exit(1)})" 2>$null
  Write-Host "Redis port 16379: $redisPing (redis-cli yok - port check yeterli)"
} catch { Write-Host "Redis: tunnel kapali" }

Write-Host ""
Write-Host "--- GIT ---"
if (Test-Path ".git") { git log -1 --oneline }

Write-Host ""
Write-Host "--- FAZ (local dev) ---"
Write-Host "F0 CH: tunnel 18123 + USE_CLICKHOUSE_CANDLES"
Write-Host "F1 XP: USE_REDIS_WEEKLY_XP + REDIS tunnel 16379"
Write-Host "F2-F6: VM prod (local sadece kod)"
Write-Host "F7: price worker VM uzerinde"
Write-Host "(parity gate iptal)"

Write-Host ""
Write-Host "Bitti. VM: bash deploy/vm/solana-only-audit.sh" -ForegroundColor Cyan
