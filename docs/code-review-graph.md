# code-review-graph (pump-tma)

Local-first Tree-sitter knowledge graph for Cursor MCP + PR risk comments.

Upstream: https://github.com/tirth8205/code-review-graph (v2.3.7)

## Why

Large monorepo reviews waste tokens on Grep/read sweeps. The graph returns callers, dependents, blast radius, and a minimal file set for agents and CI.

## One-time setup (dev machine)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-code-review-graph.ps1
```

This creates `.venv-crg/` (gitignored), installs the CLI, builds `.code-review-graph/`, and wires `.cursor/mcp.json` to the venv Python.

**Windows note:** do not use `pip install --user` alone — CRG probes parsers with `python -I`, which hides user site-packages and yields empty graphs. Always use `.venv-crg`.

Then **restart Cursor** so the `code-review-graph` MCP server loads.

### Windows: auto-update on save (PowerShell hooks)

Global hooks live in `%USERPROFILE%\.cursor\hooks\` as **`.ps1`** (not `.sh` — bash scripts open in Visual Studio on Windows).

- `crg-update.ps1` — runs `code_review_graph update --skip-flows` after each save when `.code-review-graph/` exists
- Wired from `~/.cursor/hooks.json` via `powershell -ExecutionPolicy Bypass -File …`

One-time graph build (if missing):

```powershell
cd C:\Users\DARK\Desktop\pump-tma
python -m code_review_graph build
```

Restart Cursor after hook changes. No per-prompt action needed — agents use MCP graph tools; saves keep the graph fresh.

## Daily use

- Agents: prefer graph MCP tools (see `.cursor/rules/code-review-graph.mdc`) before Grep.
- Refresh after big pulls: `.\.venv-crg\Scripts\code-review-graph.exe update`
- Watch mode: `.\.venv-crg\Scripts\code-review-graph.exe watch`
- Status: `.\.venv-crg\Scripts\code-review-graph.exe status`

## CI

`.github/workflows/code-review-graph.yml` posts a sticky PR comment with risk-scored impact (local on the runner; no code leaves GitHub).

## Ignore list

`.code-review-graphignore` excludes public assets, program build artifacts, ui-ux-pro-max CSV dumps, etc.
