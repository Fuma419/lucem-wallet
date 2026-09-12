const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  ownedInputPaymentHashes,
  paymentKeyHashHexFromCslAddress,
  ledgerInputPaths,
} = require('../../../../api/tx/cip30-input-key-hashes');

const {
  ADDRESS_ROLE,
  derivePaymentFromAccountPublicKey,
} = require('../../../../api/extension/multi-address');

const NETWORK_ID_NUMBER = 0;

function accountKeys() {
  const entropy = Buffer.alloc(32, 0x42);
  const accountPrv = CSL.Bip32PrivateKey.from_bip39_entropy(
    entropy,
    Buffer.alloc(0)
  )
    .derive(1852 + 0x80000000)
    .derive(1815 + 0x80000000)
    .derive(0x80000000);
  const publicKeyHex = Buffer.from(accountPrv.to_public().as_bytes()).toString(
    'hex'
  );
  const external0 = derivePaymentFromAccountPublicKey(
    CSL,
    publicKeyHex,
    NETWORK_ID_NUMBER,
    ADDRESS_ROLE.external,
    0
  );
  const internal0 = derivePaymentFromAccountPublicKey(
    CSL,
    publicKeyHex,
    NETWORK_ID_NUMBER,
    ADDRESS_ROLE.internal,
    0
  );
  return { external0, internal0 };
}

function utxoOn(paymentAddr, txHashByte, index) {
  const addr = CSL.Address.from_bech32(paymentAddr);
  const txHash = CSL.TransactionHash.from_bytes(Buffer.alloc(32, txHashByte));
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(txHash, index),
    CSL.TransactionOutput.new(
      addr,
      CSL.Value.new(CSL.BigNum.from_str('5000000'))
    )
  );
}

function txSpending(utxo) {
  const inputs = CSL.TransactionInputs.new();
  inputs.add(utxo.input());
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(utxo.output());
  const body = CSL.TransactionBody.new(
    inputs,
    outputs,
    CSL.BigNum.from_str('170000'),
    CSL.BigNum.from_str('1000000')
  );
  return CSL.Transaction.new(body, CSL.TransactionWitnessSet.new());
}

describe('ownedInputPaymentHashes', () => {
  test('uses the change-address payment key, not external index 0', () => {
    const { external0, internal0 } = accountKeys();
    const changeUtxo = utxoOn(internal0.paymentAddr, 0x11, 0);
    const tx = txSpending(changeUtxo);
    const hashes = ownedInputPaymentHashes(CSL, tx, [changeUtxo]);
    expect(hashes).toEqual([internal0.paymentKeyHash]);
    expect(hashes[0]).not.toBe(external0.paymentKeyHash);
  });

  test('skips inputs this account does not own', () => {
    const { internal0 } = accountKeys();
    const ours = utxoOn(internal0.paymentAddr, 0x11, 0);
    const tx = txSpending(utxoOn(internal0.paymentAddr, 0x22, 1));
    expect(ownedInputPaymentHashes(CSL, tx, [ours])).toEqual([]);
  });

  test('paymentKeyHashHexFromCslAddress reads a base address', () => {
    const { external0 } = accountKeys();
    const addr = CSL.Address.from_bech32(external0.paymentAddr);
    expect(paymentKeyHashHexFromCslAddress(CSL, addr)).toBe(
      external0.paymentKeyHash
    );
  });
});

describe('ledgerInputPaths', () => {
  test('stamps each input with the path of its payment key', () => {
    const { external0, internal0 } = accountKeys();
    const changeUtxo = utxoOn(internal0.paymentAddr, 0x11, 0);
    const tx = txSpending(changeUtxo);
    const extPath = [0x80000000 + 1852, 0x80000000 + 1815, 0x80000000, 0, 0];
    const intPath = [0x80000000 + 1852, 0x80000000 + 1815, 0x80000000, 1, 0];
    const paths = ledgerInputPaths(
      CSL,
      tx,
      [changeUtxo],
      {
        [external0.paymentKeyHash.toLowerCase()]: extPath,
        [internal0.paymentKeyHash.toLowerCase()]: intPath,
      },
      extPath
    );
    expect(paths).toEqual([intPath]);
  });
});
