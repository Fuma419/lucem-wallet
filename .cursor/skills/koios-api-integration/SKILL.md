# Koios API Integration

**Trigger:** Agent modifies or adds Koios API calls, changes network configuration, or updates blockchain data fetching.

## Architecture

- **Endpoint definitions:** `src/api/koios-endpoints.js` — all REST paths, HTTP methods, and request builders.
- **HTTP helpers:** `src/api/util.js` — `koiosRequest()`, `koiosRequestEnhanced()`, response conversion.
- **Provider config:** `src/config/provider.js` — base URLs, API key resolution from `secrets` + env vars.
- **Network nodes:** `src/config/config.js` `NODE` object — mainnet/testnet/preview/preprod URLs.

## Endpoint structure

Endpoints are defined in `KOIOS_ENDPOINTS` and wrapped in `KOIOS_REQUESTS`:
```js
KOIOS_REQUESTS.getAddressInfo(address)    // → { endpoint, body }
KOIOS_REQUESTS.getTxInfo(txHash)          // → { endpoint, body }
KOIOS_REQUESTS.getAccountInfo(stakeAddr)  // → { endpoint, body }
```

Callers pass the result to `koiosRequest(endpoint, headers, body)`.

## Rules

1. All new API calls must be defined in `koios-endpoints.js`, not inline in business logic.
2. Use `koiosRequest` or `koiosRequestEnhanced` — never raw `fetch` for Koios endpoints.
3. Handle Koios error responses: check `result.error`, `result.status_code` (400/429/500).
4. Koios public endpoints work without API keys but are rate-limited. Keys come from `secrets.*.js` or env vars.
5. Test new endpoints by adding cases to `src/test/unit/api/koios-endpoints.test.js`.

## Supported networks

| Network | Node URL | Network ID |
|---------|----------|------------|
| Mainnet | `https://api.koios.rest/api/v1` | `mainnet` |
| Testnet | `https://testnet.koios.rest/api/v1` | `testnet` |
| Preview | `https://preview.koios.rest/api/v1` | `preview` |
| Preprod | `https://preprod.koios.rest/api/v1` | `preprod` |

## Anti-patterns
- Hard-coding Koios URLs outside `config.js`/`provider.js`.
- Ignoring the `error` field in Koios responses.
- Making Koios calls directly from UI components (call through `src/api/extension/index.js`).
