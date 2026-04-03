# Koios API Integration

**Trigger:** Agent modifies/adds Koios API calls or network configuration.

## Architecture
- Endpoints: `src/api/koios-endpoints.js` (definitions + `KOIOS_REQUESTS` helpers)
- HTTP: `src/api/util.js` (`koiosRequest`, `koiosRequestEnhanced`)
- Config: `src/config/provider.js` (URLs, API keys), `src/config/config.js` (`NODE` URLs)

## Rules
1. Define new endpoints in `koios-endpoints.js`, not inline.
2. Use `koiosRequest`/`koiosRequestEnhanced` — never raw `fetch` for Koios.
3. Handle `result.error`, `result.status_code` (400/429/500).
4. Test: add cases to `koios-endpoints.test.js`.

## Networks
| Network | URL |
|---------|-----|
| Mainnet | `https://api.koios.rest/api/v1` |
| Preprod | `https://preprod.koios.rest/api/v1` |
| Preview | `https://preview.koios.rest/api/v1` |
