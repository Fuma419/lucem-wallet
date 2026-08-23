#!/usr/bin/env bash
# Launch Jenkins MCP with token loaded from agent-secrets (Cursor may not inherit bashrc).
# Prefer nvm Node so Cursor-agent's bundled `node` does not break npm/npx prefix.
set -euo pipefail

prefer_nvm_node() {
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  local ver="" d extra
  if [[ -f .nvmrc ]]; then
    ver="$(tr -d ' v\r\n' < .nvmrc)"
  fi
  local candidates=()
  [[ -n "$ver" ]] && candidates+=("$nvm_dir/versions/node/v${ver}/bin")
  candidates+=("$nvm_dir/versions/node/v24.19.0/bin")
  extra="$(ls -1d "$nvm_dir/versions/node"/v24.*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
  [[ -n "$extra" ]] && candidates+=("$extra")
  for d in "${candidates[@]}"; do
    if [[ -x "$d/node" && -x "$d/npx" ]]; then
      export PATH="$d:$PATH"
      unset npm_config_prefix
      return 0
    fi
  done
  return 0
}
prefer_nvm_node

token_file="${HOME}/.config/agent-secrets/jenkins_api_token"
user_file="${HOME}/.config/agent-secrets/jenkins_user"
if [[ -z "${JENKINS_API_TOKEN:-}" && -r "$token_file" ]]; then
  JENKINS_API_TOKEN="$(tr -d '\r\n' < "$token_file")"
  export JENKINS_API_TOKEN
fi
if [[ -z "${JENKINS_USER:-}" && -r "$user_file" ]]; then
  JENKINS_USER="$(tr -d '\r\n' < "$user_file")"
fi
if [[ -z "${JENKINS_API_TOKEN:-}" ]]; then
  echo "JENKINS_API_TOKEN missing. Run set-jenkins-token first." >&2
  exit 1
fi
export JENKINS_URL="${JENKINS_URL:-http://192.168.68.143:8080}"
# Must match the owner of jenkins_api_token (this host: admin, not bzawodni).
export JENKINS_USER="${JENKINS_USER:-admin}"
exec npx -y @alexsarrell/jenkins-mcp-server "$@"
