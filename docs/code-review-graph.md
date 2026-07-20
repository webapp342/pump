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

### Windows: do not enable CRG file hooks

`code-review-graph install --platform cursor` can add global hooks under `%USERPROFILE%\.cursor\hooks.json` (`crg-update.sh`, `crg-pre-commit.sh`, …). On Windows those are **bash scripts** — Cursor/Windows often **opens them in Visual Studio** instead of running them silently on every save.

**Use MCP only on Windows.** If hooks were installed, remove the `afterFileEdit` / `sessionStart` / CRG `beforeShellExecution` entries from `~/.cursor/hooks.json` and keep only your existing PowerShell hooks (e.g. `shell-guard.ps1`). Refresh the graph manually:

```powershell
python -m code_review_graph update
```

Or from project venv after `scripts/setup-code-review-graph.ps1`.

## Daily use

- Agents: prefer graph MCP tools (see `.cursor/rules/code-review-graph.mdc`) before Grep.
- Refresh after big pulls: `.\.venv-crg\Scripts\code-review-graph.exe update`
- Watch mode: `.\.venv-crg\Scripts\code-review-graph.exe watch`
- Status: `.\.venv-crg\Scripts\code-review-graph.exe status`

## CI

`.github/workflows/code-review-graph.yml` posts a sticky PR comment with risk-scored impact (local on the runner; no code leaves GitHub).

## Ignore list

`.code-review-graphignore` excludes public assets, program build artifacts, ui-ux-pro-max CSV dumps, etc.
