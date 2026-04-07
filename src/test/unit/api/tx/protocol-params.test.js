const {
  parseKoiosTipSlot,
  latestEpochParamsRow,
  buildProtocolParametersSnapshot,
} = require('../../../../api/tx/protocol-params');

describe('protocol-params', () => {
  test('parseKoiosTipSlot reads abs_slot', () => {
    expect(parseKoiosTipSlot({ abs_slot: '42' })).toBe(42);
  });

  test('latestEpochParamsRow takes first array element', () => {
    expect(latestEpochParamsRow([{ min_fee_a: 44 }])).toEqual({
      min_fee_a: 44,
    });
  });

  test('buildProtocolParametersSnapshot maps Koios row', () => {
    const row = {
      min_fee_a: 44,
      min_fee_b: 155381,
      pool_deposit: '500000000',
      key_deposit: '2000000',
      coins_per_utxo_size: '4310',
      max_val_size: 5000,
      max_tx_size: '16384',
      collateral_percent: 150,
      max_collateral_inputs: 3,
    };
    const snap = buildProtocolParametersSnapshot(row, 99);
    expect(snap.slot).toBe(99);
    expect(snap.linearFee.minFeeA).toBe('44');
    expect(snap.linearFee.minFeeB).toBe('155381');
    expect(snap.coinsPerUtxoWord).toBe('4310');
    expect(snap.maxTxSize).toBe(16384);
    expect(snap.collateralPercentage).toBe(150);
  });
});
