#   Use one of these on your machine (put your real key where indicated).
#   Minimal (HTTP status only):

  export DYNU_API_KEY='644VTd666U66c5466W6efabb66364334'
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
    -H 'accept: application/json' \
    -H "API-Key: ${DYNU_API_KEY}" \
    https://api.dynu.com/v2/dns

#   • `200` → key is accepted.
#   • `401` → key is wrong, revoked, or not sent.

#   See Dynu’s JSON status (still avoids dumping the huge domain list):

  export DYNU_API_KEY='644VTd666U66c5466W6efabb66364334'
  curl -sS \
    -H 'accept: application/json' \
    -H "API-Key: ${DYNU_API_KEY}" \
    https://api.dynu.com/v2/dns | jq '{statusCode, domainCount: (.domains | 
  length)}'

#   Sanity check that auth is actually enforced (should be 401):

  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' \
    -H 'accept: application/json' \
    -H 'API-Key: definitely-not-a-real-key' \
    https://api.dynu.com/v2/dns

#   Note: a successful 200 response body includes per-host update tokens. Do not
#   paste that JSON into chats or logs if you can avoid it.
