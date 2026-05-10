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

export const normalizeDelegationRow = (stakeRow = {}, stakeAddress = '') => ({
  ...emptyDelegation(stakeAddress),
  registered: true,
  active: Boolean(stakeRow.active),
  rewards: toPoolMetric(stakeRow.withdrawable_amount),
  poolId: stakeRow.pool_id || '',
});
