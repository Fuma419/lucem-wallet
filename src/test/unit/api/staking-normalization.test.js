import {
  emptyDelegation,
  normalizeDelegationRow,
  normalizeStakePool,
} from '../../../api/staking';

describe('staking normalization', () => {
  test('returns explicit undelegated state for empty accounts', () => {
    expect(emptyDelegation('stake_test1xyz')).toEqual({
      registered: false,
      active: false,
      rewards: '0',
      stakeAddress: 'stake_test1xyz',
      poolId: '',
      poolIdHex: '',
      ticker: '',
      description: '',
      name: '',
      homepage: '',
    });
  });

  test('normalizes account delegation rows without ambiguous empty objects', () => {
    expect(
      normalizeDelegationRow(
        {
          active: true,
          withdrawable_amount: '3450000',
          pool_id: 'pool1abc',
        },
        'stake_test1xyz'
      )
    ).toMatchObject({
      registered: true,
      active: true,
      rewards: '3450000',
      stakeAddress: 'stake_test1xyz',
      poolId: 'pool1abc',
    });
  });

  test('normalizes Koios account_info (delegated_pool, no active field)', () => {
    expect(
      normalizeDelegationRow(
        {
          delegated_pool: 'pool1xyz',
          rewards_available: '1230000',
        },
        'stake_test1abc'
      )
    ).toMatchObject({
      registered: true,
      active: true,
      rewards: '1230000',
      poolId: 'pool1xyz',
    });
  });

  test('Blockfrost active:false with pool_id still shows delegated', () => {
    expect(
      normalizeDelegationRow(
        { active: false, pool_id: 'pool1abc', withdrawable_amount: '0' },
        'stake_test1abc'
      )
    ).toMatchObject({
      registered: true,
      active: true,
      poolId: 'pool1abc',
    });
  });

  test('undelegated Koios account (no delegated_pool) is not active', () => {
    expect(
      normalizeDelegationRow(
        { status: 'registered' },
        'stake_test1abc'
      )
    ).toMatchObject({
      registered: true,
      active: false,
      poolId: '',
    });
  });

  test('normalizes stake pool metadata and metrics', () => {
    expect(
      normalizeStakePool({
        pool_id_bech32: 'pool1abc',
        pool_id_hex: 'ab'.repeat(28),
        margin: '0.025',
        fixed_cost: '340000000',
        pledge: '1000000000',
        active_stake: '5000000000',
        live_saturation: '0.42',
        block_count: 12,
        meta_json: {
          ticker: 'LUCEM',
          name: 'Lucem Pool',
          description: 'A bright stake pool',
          homepage: 'https://example.com',
        },
      })
    ).toEqual({
      id: 'pool1abc',
      poolId: 'pool1abc',
      poolIdHex: 'ab'.repeat(28),
      ticker: 'LUCEM',
      name: 'Lucem Pool',
      description: 'A bright stake pool',
      homepage: 'https://example.com',
      margin: 0.025,
      fixedCost: '340000000',
      pledge: '1000000000',
      activeStake: '5000000000',
      liveSaturation: 0.42,
      blocks: '12',
      status: 'registered',
    });
  });
});
