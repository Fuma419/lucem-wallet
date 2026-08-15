/**
 * Blockfrost → Koios adapter: mapper coverage + mocked request paths.
 * Source-guards keep the adapter out of util.js.
 */
const fs = require('fs');
const path = require('path');
const {
  amountListToKoiosValueAndAssets,
  blockfrostKoiosCompatibleRequest,
  blockfrostTxToKoiosTxInfo,
  blockfrostUtxoToKoios,
  toKoiosEpochParams,
} = require('../../../../api/providers/blockfrost');

const POLICY = 'a'.repeat(56);
const ASSET_NAME = '74657374';
const UNIT = `${POLICY}${ASSET_NAME}`;
const TX_HASH = 'c'.repeat(64);

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('Blockfrost → Koios adapter', () => {
  const originalFetch = global.fetch;
  const originalPreviewKey = process.env.BLOCKFROST_PROJECT_ID_PREVIEW;

  beforeEach(() => {
    process.env.BLOCKFROST_PROJECT_ID_PREVIEW = 'preview_test_project_id';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPreviewKey === undefined) {
      delete process.env.BLOCKFROST_PROJECT_ID_PREVIEW;
    } else {
      process.env.BLOCKFROST_PROJECT_ID_PREVIEW = originalPreviewKey;
    }
  });

  test('blockfrostUtxoToKoios splits lovelace and CIP-14 units', () => {
    const mapped = blockfrostUtxoToKoios({
      tx_hash: TX_HASH,
      output_index: 2,
      amount: [
        { unit: 'lovelace', quantity: '1500000' },
        { unit: UNIT, quantity: '7' },
      ],
    });
    expect(mapped).toEqual({
      tx_hash: TX_HASH,
      tx_index: 2,
      output_index: 2,
      value: '1500000',
      asset_list: [{ policy_id: POLICY, asset_name: ASSET_NAME, quantity: '7' }],
    });
  });

  test('toKoiosEpochParams prefers coins_per_utxo_size and defaults ref-script cost', () => {
    expect(
      toKoiosEpochParams({
        min_fee_a: 44,
        min_fee_b: 155381,
        coins_per_utxo_word: 4310,
        coins_per_utxo_size: 4310,
      })
    ).toMatchObject({
      min_fee_a: 44,
      coins_per_utxo_size: 4310,
      min_fee_ref_script_cost_per_byte: 0,
    });
  });

  test('amountListToKoiosValueAndAssets treats missing lovelace as zero', () => {
    expect(amountListToKoiosValueAndAssets()).toEqual({
      value: '0',
      asset_list: [],
    });
    expect(
      amountListToKoiosValueAndAssets([{ unit: UNIT, quantity: '3' }])
    ).toEqual({
      value: '0',
      asset_list: [{ policy_id: POLICY, asset_name: ASSET_NAME, quantity: '3' }],
    });
  });

  test('blockfrostTxToKoiosTxInfo maps fee, output, and deposit', () => {
    const info = blockfrostTxToKoiosTxInfo(TX_HASH, {
      block_height: 99,
      block_time: 1_700_000_000,
      index: 4,
      size: 300,
      fees: '170000',
      deposit: '2000000',
      output_amount: [{ unit: 'lovelace', quantity: '5000000' }],
      invalid_hereafter: 50_000_000,
    });
    expect(info).toMatchObject({
      tx_hash: TX_HASH,
      block_height: 99,
      tx_timestamp: 1_700_000_000,
      tx_block_index: 4,
      total_output: '5000000',
      fee: '170000',
      deposit: '2000000',
      invalid_after: 50_000_000,
    });
  });

  test('blockfrostKoiosCompatibleRequest maps /tip and /epoch_params', async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.endsWith('/blocks/latest')) {
        return jsonResponse(200, { slot: 12, height: 34, hash: 'ab' });
      }
      if (href.endsWith('/epochs/latest/parameters')) {
        return jsonResponse(200, { min_fee_a: 44, min_fee_b: 155381 });
      }
      return jsonResponse(404, { message: href });
    });

    await expect(
      blockfrostKoiosCompatibleRequest('preview', '/tip')
    ).resolves.toEqual([{ abs_slot: 12, block_height: 34, hash: 'ab' }]);

    const [params] = await blockfrostKoiosCompatibleRequest(
      'preview',
      '/epoch_params'
    );
    expect(params.min_fee_a).toBe(44);
    expect(params.min_fee_b).toBe(155381);
  });

  test('unadapted endpoints return undefined so koiosRequest can fall through', async () => {
    global.fetch = jest.fn();
    await expect(
      blockfrostKoiosCompatibleRequest('preview', '/drep_info', { _drep_ids: [] })
    ).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('/address_info sums lovelace and maps the UTxO set', async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.includes('/addresses/addr_test1/utxos')) {
        return jsonResponse(200, [
          {
            tx_hash: TX_HASH,
            output_index: 0,
            amount: [{ unit: 'lovelace', quantity: '2000000' }],
          },
        ]);
      }
      return jsonResponse(404, {});
    });

    const rows = await blockfrostKoiosCompatibleRequest(
      'preview',
      '/address_info',
      { _addresses: ['addr_test1'] }
    );
    expect(rows).toEqual([
      {
        address: 'addr_test1',
        balance: '2000000',
        utxo_set: [
          {
            tx_hash: TX_HASH,
            tx_index: 0,
            output_index: 0,
            value: '2000000',
            asset_list: [],
          },
        ],
      },
    ]);
  });

  test('/account_info maps a registered account and a 404 as unregistered', async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.endsWith('/accounts/stake_ok')) {
        return jsonResponse(200, {
          active: true,
          pool_id: 'pool1abc',
          controlled_amount: '9000000',
          withdrawable_amount: '1000000',
        });
      }
      if (href.endsWith('/accounts/stake_missing')) {
        return jsonResponse(404, { message: 'Not Found' });
      }
      return jsonResponse(500, { message: href });
    });

    const rows = await blockfrostKoiosCompatibleRequest(
      'preview',
      '/account_info',
      { _stake_addresses: ['stake_ok', 'stake_missing'] }
    );
    expect(rows[0]).toMatchObject({
      stake_address: 'stake_ok',
      registered: true,
      status: 'registered',
      pool_id: 'pool1abc',
      utxo: '9000000',
      withdrawable_amount: '1000000',
    });
    expect(rows[1]).toMatchObject({
      stake_address: 'stake_missing',
      registered: false,
      status: 'unregistered',
      utxo: '0',
    });
  });

  test('/tx_status skips 404 hashes and keeps confirmed rows', async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url);
      if (href.endsWith(`/txs/${TX_HASH}`)) {
        return jsonResponse(200, {
          tx_index: 1,
          block_height: 88,
          confirmations: 5,
        });
      }
      return jsonResponse(404, { message: 'Not Found' });
    });

    const rows = await blockfrostKoiosCompatibleRequest(
      'preview',
      '/tx_status',
      { _tx_hashes: [TX_HASH, 'd'.repeat(64)] }
    );
    expect(rows).toEqual([
      {
        tx_hash: TX_HASH,
        tx_index: 1,
        block_height: 88,
        num_confirmations: 5,
      },
    ]);
  });
});

describe('Blockfrost adapter source guards', () => {
  const root = path.join(__dirname, '../../../../');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

  test('util.js imports the adapter and no longer defines it', () => {
    const src = read('api/util.js');
    expect(src).toMatch(/from '\.\/providers\/blockfrost'/);
    expect(src).not.toMatch(/function blockfrostUtxoToKoios/);
    expect(src).not.toMatch(/function blockfrostKoiosCompatibleRequest/);
    expect(src).not.toMatch(/function fetchBlockfrostJson/);
  });

  test('tsconfig.api.json typechecks the providers tree', () => {
    const tsconfig = JSON.parse(read('../tsconfig.api.json'));
    expect(tsconfig.include).toContain('src/api/providers/**/*.ts');
  });
});
