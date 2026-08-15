/**
 * @jest-environment node
 *
 * searchPools must actually query by ticker or pool id. The Blockfrost
 * /pool_list adapter is an unfiltered page of ids, so ticker search has to
 * use the Koios-shaped filter (or a direct pool_info lookup).
 */
const fs = require('fs');
const path = require('path');

const mockKoiosRequest = jest.fn();
jest.mock('../../../api/util', () => {
  const actual = jest.requireActual('../../../api/util');
  return { ...actual, koiosRequest: (...args) => mockKoiosRequest(...args) };
});

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: { load: jest.fn(), Cardano: {} },
}));

const { searchPools } = require('../../../api/extension/chain-reads');

describe('searchPools', () => {
  beforeEach(() => {
    mockKoiosRequest.mockReset();
  });

  test('ticker search hits pool_list ticker=ilike then pool_info', async () => {
    mockKoiosRequest
      .mockResolvedValueOnce([
        { pool_id_bech32: 'pool1wave' },
      ])
      .mockResolvedValueOnce([
        {
          pool_id_bech32: 'pool1wave',
          pool_id_hex: 'ab'.repeat(28),
          meta_json: { ticker: 'WAVE', name: 'WAVE Pool' },
        },
      ]);

    const pools = await searchPools('WAVE');
    expect(mockKoiosRequest.mock.calls[0][0]).toBe(
      '/pool_list?pool_status=eq.registered&ticker=ilike.*wave*&limit=20'
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ ticker: 'WAVE', poolId: 'pool1wave' });
  });

  test('bech32 pool id uses pool_info, not an unfiltered list page', async () => {
    mockKoiosRequest.mockResolvedValueOnce([
      {
        pool_id_bech32:
          'pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy',
        meta_json: { ticker: 'STOIC', name: 'Stoic Pool' },
      },
    ]);

    const pools = await searchPools(
      'pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy'
    );
    expect(mockKoiosRequest).toHaveBeenCalledTimes(1);
    expect(String(mockKoiosRequest.mock.calls[0][0])).toMatch(/pool_info/);
    expect(pools[0].ticker).toBe('STOIC');
  });

  test('source uses the shared search request builder', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/chain-reads.js'),
      'utf8'
    );
    expect(src).toMatch(/buildStakePoolSearchRequest/);
    expect(src).not.toMatch(/or=\(ticker\.ilike/);
  });
});
