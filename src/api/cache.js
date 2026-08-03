/**
 * In-memory request cache with TTL + in-flight de-duplication.
 *
 * Purpose: navigating between screens (wallet ↔ staking ↔ governance) or
 * switching accounts used to re-issue the same Koios reads every time, so users
 * stared at loading spinners. This coalesces concurrent identical reads and
 * serves recent results for a short window, with an explicit `force` bypass for
 * pull-to-refresh and post-transaction refreshes.
 *
 * SAFETY: never cache transaction-building inputs or submits. `getUtxos()` (tx
 * construction) and `submitTx()` must always hit fresh chain state — see their
 * definitions in `src/api/extension/index.js`. Only read-only display data
 * (balances, delegation, tx history, protocol params, fiat price) is cached.
 */

export const DEFAULT_TTL_MS = 90_000;

const entries = new Map(); // key -> { value, expiry }
const inflight = new Map(); // key -> Promise

/** Build a stable cache key from primitive parts (null/undefined => empty). */
export const cacheKey = (...parts) =>
  parts.map((part) => (part == null ? '' : String(part))).join('|');

/** Return a live (non-expired) cached value, or undefined. Synchronous. */
export const getCached = (key) => {
  const hit = entries.get(key);
  if (hit && hit.expiry > Date.now()) return hit.value;
  return undefined;
};

/** Return the last cached value even if expired (for warm first paint). */
export const peekCached = (key) => {
  const hit = entries.get(key);
  return hit ? hit.value : undefined;
};

/** Store a value with a TTL. Returns the value for convenient chaining. */
export const setCached = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  entries.set(key, { value, expiry: Date.now() + ttlMs });
  return value;
};

/**
 * Resolve `key` from cache when fresh, coalescing concurrent misses into a
 * single `fetcher()` call. Pass `{ force: true }` to bypass the cache and issue
 * a fresh fetch (the result still refreshes the cache for later reads).
 *
 * Failures are never cached: a rejected fetch clears the entry so the next call
 * retries.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ ttlMs?: number, force?: boolean }} [options]
 * @returns {Promise<T>}
 */
export async function withCache(key, fetcher, { ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  if (!force) {
    const hit = entries.get(key);
    if (hit && hit.expiry > Date.now()) return hit.value;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const promise = (async () => {
    const value = await fetcher();
    entries.set(key, { value, expiry: Date.now() + ttlMs });
    return value;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    entries.delete(key);
    throw error;
  } finally {
    // Only clear if this promise is still the current in-flight entry; a forced
    // fetch may have replaced it.
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}

/** Drop a single cache entry (and any in-flight promise) by exact key. */
export const invalidate = (key) => {
  entries.delete(key);
  inflight.delete(key);
};

/** Drop every entry whose key starts with `prefix` (e.g. a network id). */
export const invalidatePrefix = (prefix) => {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
  for (const key of inflight.keys()) if (key.startsWith(prefix)) inflight.delete(key);
};

/** Clear the entire cache (wallet reset, logout, hard refresh). */
export const invalidateAll = () => {
  entries.clear();
  inflight.clear();
};
