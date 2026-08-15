export const emptyDelegation = (stakeAddress = '') => ({
  registered: false,
  active: false,
  rewards: '0',
  stakeAddress,
  poolId: '',
  poolIdHex: '',
  ticker: '',
  description: '',
  name: '',
  homepage: '',
});

export const toPoolMetric = (value, fallback = '0') => {
  if (value == null || value === '') return fallback;
  return String(value);
};

export const normalizeStakePool = (pool = {}, fallbackPoolId = '') => {
  const metadata = pool.meta_json || {};
  const poolId = pool.pool_id_bech32 || pool.pool_id || fallbackPoolId || '';
  const ticker = metadata.ticker || pool.ticker || 'Unknown';
  const name = metadata.name || pool.name || ticker || 'Unknown pool';
  const liveSaturation = Number.parseFloat(
    String(pool.live_saturation ?? pool.saturation ?? '0')
  );
  const margin = Number.parseFloat(String(pool.margin ?? '0'));

  return {
    id: poolId,
    poolId,
    poolIdHex: pool.pool_id_hex || pool.hex || '',
    ticker,
    name,
    description: metadata.description || pool.description || '',
    homepage: metadata.homepage || pool.homepage || '',
    margin: Number.isFinite(margin) ? margin : 0,
    fixedCost: toPoolMetric(pool.fixed_cost ?? pool.cost),
    pledge: toPoolMetric(pool.pledge),
    activeStake: toPoolMetric(pool.active_stake),
    liveSaturation: Number.isFinite(liveSaturation) ? liveSaturation : 0,
    blocks: toPoolMetric(pool.block_count ?? pool.blocks_minted),
    status: pool.pool_status || pool.status || 'registered',
  };
};

const POOL_ID_BECH32_RE = /^pool1[a-z0-9]+$/i;
const POOL_ID_HEX_RE = /^[0-9a-f]{56}$/i;

/**
 * Build the provider lookup for stake-center search.
 * Ticker queries go to Koios `/pool_list` (Blockfrost cannot filter tickers).
 * A bech32/hex pool id is resolved via `/pool_info` instead of an `or=` list
 * filter that some adapters ignore.
 * @param {string} query
 * @returns {{ kind: 'empty' } | { kind: 'poolId', poolId: string } | { kind: 'ticker', endpoint: string }}
 */
export function buildStakePoolSearchRequest(query) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return { kind: 'empty' };
  if (POOL_ID_BECH32_RE.test(trimmed) || POOL_ID_HEX_RE.test(trimmed)) {
    return { kind: 'poolId', poolId: trimmed };
  }
  const needle = trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (needle.length < 2) return { kind: 'empty' };
  return {
    kind: 'ticker',
    endpoint: `/pool_list?pool_status=eq.registered&ticker=ilike.*${encodeURIComponent(needle)}*&limit=20`,
  };
}

export const normalizeDelegationRow = (stakeRow = {}, stakeAddress = '') => ({
  ...emptyDelegation(stakeAddress),
  registered: true,
  active: Boolean(
    stakeRow.active || stakeRow.delegated_pool || stakeRow.pool_id
  ),
  rewards: toPoolMetric(stakeRow.withdrawable_amount ?? stakeRow.rewards_available),
  poolId: stakeRow.delegated_pool || stakeRow.pool_id || '',
});
