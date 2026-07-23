#!/usr/bin/env bash
# Ensure `go` is on PATH for non-interactive SSH deploy shells (Go often in /usr/local/go/bin).
ensure_go_path() {
  export PATH="/usr/local/go/bin:/usr/lib/go/bin:${HOME}/go/bin:/usr/bin:${PATH}"
  if command -v go >/dev/null 2>&1; then
    return 0
  fi
  for candidate in /usr/local/go/bin/go /usr/lib/go/bin/go /usr/bin/go; do
    if [[ -x "$candidate" ]]; then
      export PATH="$(dirname "$candidate"):$PATH"
      return 0
    fi
  done
  return 1
}
