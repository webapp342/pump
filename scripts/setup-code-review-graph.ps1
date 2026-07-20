# Setup local code-review-graph tooling for pump-tma (Windows)
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-code-review-graph.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$VenvPython = Join-Path $Root ".venv-crg\Scripts\python.exe"
$McpPath = Join-Path $Root ".cursor\mcp.json"

if (-not (Test-Path $VenvPython)) {
  Write-Host "Creating .venv-crg ..."
  python -m venv .venv-crg
}

Write-Host "Installing code-review-graph 2.3.7 into .venv-crg ..."
& $VenvPython -m pip install --upgrade pip --progress-bar off
& $VenvPython -m pip install --progress-bar off "code-review-graph==2.3.7"

# Probe sanity (venv site-packages work with CRG's isolated -I probe)
& $VenvPython -I -c "from tree_sitter_language_pack import get_parser; get_parser('typescript'); print('parser-ok')"

Write-Host "Building knowledge graph ..."
& $VenvPython -m code_review_graph build

# Keep existing MCP servers; point CRG at the project venv
if (Test-Path $McpPath) {
  $mcp = Get-Content $McpPath -Raw | ConvertFrom-Json
} else {
  $mcp = [pscustomobject]@{ mcpServers = [pscustomobject]@{} }
}
if (-not $mcp.mcpServers) { $mcp | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) }

$crg = [ordered]@{
  command = $VenvPython
  args    = @("-m", "code_review_graph", "serve")
  cwd     = $Root
  type    = "stdio"
}
$mcp.mcpServers | Add-Member -NotePropertyName "code-review-graph" -NotePropertyValue ([pscustomobject]$crg) -Force
($mcp | ConvertTo-Json -Depth 8) | Set-Content -Path $McpPath -Encoding utf8

Write-Host "Done. Restart Cursor so MCP picks up .cursor/mcp.json"
Write-Host "CLI: .\.venv-crg\Scripts\code-review-graph.exe status"
