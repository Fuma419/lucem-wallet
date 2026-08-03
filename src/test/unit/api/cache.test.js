import {
  DEFAULT_TTL_MS,
  cacheKey,
  getCached,
  invalidate,
  invalidateAll,
  invalidatePrefix,
  peekCached,
  setCached,
  withCache,
} from '../../../api/cache';

describe('api/cache', () => {
  let now;
  beforeEach(() => {
    invalidateAll();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    invalidateAll();
  });

  test('cacheKey joins parts and maps null/undefined to empty', () => {
    expect(cacheKey('a', 1, null, undefined, 'b')).toBe('a|1|||b');
  });

  test('withCache calls the fetcher once within the TTL', async () => {
    const fetcher = jest.fn().mockResolvedValue('value');
    const a = await withCache('k', fetcher);
    const b = await withCache('k', fetcher);
    expect(a).toBe('value');
    expect(b).toBe('value');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('withCache de-duplicates concurrent misses into one fetch', async () => {
    let resolve;
    const fetcher = jest.fn(
      () => new Promise((res) => {
        resolve = res;
      })
    );
    const p1 = withCache('k', fetcher);
    const p2 = withCache('k', fetcher);
    resolve('shared');
    await expect(p1).resolves.toBe('shared');
    await expect(p2).resolves.toBe('shared');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('force bypasses a fresh cache entry', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    await withCache('k', fetcher);
    const forced = await withCache('k', fetcher, { force: true });
    expect(forced).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('entry expires after its TTL', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b');
    await withCache('k', fetcher, { ttlMs: 1000 });
    now += 1001;
    const next = await withCache('k', fetcher, { ttlMs: 1000 });
    expect(next).toBe('b');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('failures are not cached and are retried', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    await expect(withCache('k', fetcher)).rejects.toThrow('boom');
    await expect(withCache('k', fetcher)).resolves.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('getCached returns fresh values and undefined once expired', () => {
    setCached('k', 42, 1000);
    expect(getCached('k')).toBe(42);
    now += 1001;
    expect(getCached('k')).toBeUndefined();
    // peekCached still returns the stale value for warm paint.
    expect(peekCached('k')).toBe(42);
  });

  test('invalidate removes a single entry', async () => {
    const fetcher = jest.fn().mockResolvedValue('v');
    await withCache('k', fetcher);
    invalidate('k');
    await withCache('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('invalidatePrefix drops matching entries only', () => {
    setCached('preview|balance|addr', 1);
    setCached('preview|delegation|stake', 2);
    setCached('mainnet|balance|addr', 3);
    invalidatePrefix('preview|');
    expect(getCached('preview|balance|addr')).toBeUndefined();
    expect(getCached('preview|delegation|stake')).toBeUndefined();
    expect(getCached('mainnet|balance|addr')).toBe(3);
  });

  test('DEFAULT_TTL_MS is 90 seconds', () => {
    expect(DEFAULT_TTL_MS).toBe(90_000);
  });
});
