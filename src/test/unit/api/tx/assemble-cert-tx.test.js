/**
 * Real-CSL tests for the shared certificate / withdrawal / voting assembler.
 */
import { assembleCertTx } from '../../../../api/tx/csl-unsigned-tx';
import { createStakeDelegationCertificate as createDelegationCert } from '../../../../api/tx/staking-certificates';

const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
const STAKE_KEY_HASH = 'aa'.repeat(28);
const POOL_KEY_HASH = 'bb'.repeat(28);

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

function makeUtxo(coin, index = 0) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex('cc'.repeat(32)), index),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

function configureDelegation(txBuilder, Cardano) {
  const certsBuilder = Cardano.CertificatesBuilder.new();
  certsBuilder.add(createDelegationCert(Cardano, STAKE_KEY_HASH, POOL_KEY_HASH));
  txBuilder.set_certs_builder(certsBuilder);
}

describe('assembleCertTx', () => {
  test('builds a CIP-21 tx with the caller-installed certificate', async () => {
    const tx = await assembleCertTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      changeAddressBech32: TEST_ADDR,
      getUtxos: async () => [makeUtxo(50_000_000)],
      configure: configureDelegation,
    });
    expect(tx.body().certs().len()).toBe(1);
    expect(tx.body().ttl()).toBeDefined();
  });

  test('rejects missing change address without retrying', async () => {
    await expect(
      assembleCertTx({
        Cardano: CSL,
        protocolParameters: PROTOCOL_PARAMS,
        changeAddressBech32: '',
        getUtxos: async () => [makeUtxo(50_000_000)],
        configure: configureDelegation,
      })
    ).rejects.toThrow(/Payment address is required/);
  });

  test('retries coin-selection failures then succeeds', async () => {
    const getUtxos = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient selection'))
      .mockResolvedValueOnce([makeUtxo(50_000_000)]);

    const tx = await assembleCertTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      changeAddressBech32: TEST_ADDR,
      getUtxos,
      configure: configureDelegation,
      retries: 2,
      label: 'Delegation transaction',
    });
    expect(tx.body().certs().len()).toBe(1);
    expect(getUtxos).toHaveBeenCalledTimes(2);
  });

  test('exhausts retries and wraps the last error', async () => {
    await expect(
      assembleCertTx({
        Cardano: CSL,
        protocolParameters: PROTOCOL_PARAMS,
        changeAddressBech32: TEST_ADDR,
        getUtxos: async () => [],
        configure: configureDelegation,
        retries: 2,
        emptyUtxosMessage: 'No UTxOs available to pay the transaction fee',
        label: 'Delegation transaction',
      })
    ).rejects.toThrow(/Delegation transaction failed after 2 attempts/);
  });
});
