#!/usr/bin/env bash
# Launch Jenkins MCP with token loaded from agent-secrets (Cursor may not inherit bashrc).
set -euo pipefail
token_file="${HOME}/.config/agent-secrets/jenkins_api_token"
if [[ -z "${JENKINS_API_TOKEN:-}" && -r "$token_file" ]]; then
  JENKINS_API_TOKEN="$(tr -d '\r\n' < "$token_file")"
  export JENKINS_API_TOKEN
fi
if [[ -z "${JENKINS_API_TOKEN:-}" ]]; then
  echo "JENKINS_API_TOKEN missing. Run set-jenkins-token first." >&2
  exit 1
fi
export JENKINS_URL="${JENKINS_URL:-http://192.168.68.143:8080}"
export JENKINS_USER="${JENKINS_USER:-bzawodni}"
exec npx -y @alexsarrell/jenkins-mcp-server "$@"
