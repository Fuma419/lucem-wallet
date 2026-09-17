const {
  blockSummaryFromTxInfo,
  convertKoiosTxToExpectedFormat,
  detailFromKoiosTxInfo,
  isHistoryDetailComplete,
  normalizeTxMetadata,
  utxosFromTxInfo,
} = require('../../../../api/tx/tx-history');
const { TX_KIND } = require('../../../../api/tx/tx-kind');

const sampleTx = {
  tx_hash: 'ab'.repeat(32),
  block_height: 123,
  block_hash: 'cd'.repeat(32),
  epoch_no: 500,
  absolute_slot: 99,
  tx_timestamp: 1_700_000_000,
  fee: '170000',
  deposit: '0',
  certificates: [{ type: 'delegation' }],
  voting_procedures: [{ vote: 'yes' }],
  withdrawals: [],
  assets_minted: [],
  plutus_contracts: [],
  metadata: { '674': { msg: ['hello'] } },
  inputs: [
    {
      payment_addr: { bech32: 'addr_test1_in' },
      value: '2000000',
      asset_list: [],
    },
  ],
  outputs: [
    {
      address: 'addr_test1_out',
      value: '1800000',
      asset_list: [{ policy_id: 'aa', asset_name: 'bb', quantity: '1' }],
    },
  ],
};

describe('tx-history hydration', () => {
  test('normalizeTxMetadata flattens Koios objects and Blockfrost arrays', () => {
    expect(normalizeTxMetadata({ '721': { version: 1 } })).toEqual([
      { label: '721', json_metadata: { version: 1 } },
    ]);
    expect(
      normalizeTxMetadata({
        tx_hash: 'x',
        metadata: { '61284': { '1': 'k' } },
      })
    ).toEqual([{ label: '61284', json_metadata: { '1': 'k' } }]);
    expect(
      normalizeTxMetadata([{ label: 674, json_metadata: { msg: ['hi'] } }])
    ).toEqual([{ label: '674', json_metadata: { msg: ['hi'] } }]);
  });

  test('utxosFromTxInfo maps payment_addr.bech32 to address', () => {
    const utxos = utxosFromTxInfo(sampleTx);
    expect(utxos.inputs[0].address).toBe('addr_test1_in');
    expect(utxos.outputs[0].address).toBe('addr_test1_out');
  });

  test('blockSummaryFromTxInfo is enough for the history timestamp', () => {
    const block = blockSummaryFromTxInfo(sampleTx);
    expect(block.block_height).toBe(123);
    expect(block.block_time).toBe(1_700_000_000);
    expect(block.epoch_no).toBe(500);
  });

  test('detailFromKoiosTxInfo is complete and keeps vote + delegation extras', () => {
    const detail = detailFromKoiosTxInfo(sampleTx);
    expect(isHistoryDetailComplete(detail)).toBe(true);
    expect(detail.info.delegation_count).toBe(1);
    expect(detail.info.vote_count).toBe(1);
    expect(detail.extra).toEqual(
      expect.arrayContaining([TX_KIND.delegation, TX_KIND.vote])
    );
    expect(detail.metadata).toEqual([
      { label: '674', json_metadata: { msg: ['hello'] } },
    ]);
  });

  test('falls back to Blockfrost-style count fields when arrays are empty', () => {
    const info = convertKoiosTxToExpectedFormat({
      tx_hash: 'ff'.repeat(32),
      certificates: [],
      withdrawals: [],
      voting_procedures: [],
      assets_minted: [],
      plutus_contracts: [],
      delegation_count: 2,
      withdrawal_count: 1,
      stake_cert_count: 1,
      asset_mint_or_burn_count: 3,
      redeemer_count: 4,
    });
    expect(info.delegation_count).toBe(2);
    expect(info.withdrawal_count).toBe(1);
    expect(info.stake_cert_count).toBe(1);
    expect(info.asset_mint_or_burn_count).toBe(3);
    expect(info.redeemer_count).toBe(4);
  });
});
