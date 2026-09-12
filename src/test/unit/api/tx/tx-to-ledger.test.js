/**
 * Real-CSL encoding of a payment tx for Ledger. Catches the next missing
 * v15 method (datum / kind / ttl.to_str / validity_interval_start) instead
 * of only asserting source contracts.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const { HARDENED, DatumType, TxOutputFormat, CertificateType } = require(
  '@cardano-foundation/ledgerjs-hw-app-cardano'
);
const { txToLedger } = require('../../../../api/util');
const { NETWORK_ID } = require('../../../../config/config');

const paymentCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from('ab'.repeat(28), 'hex'))
  );

const stakeCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from('cd'.repeat(28), 'hex'))
  );

const testAddress = () =>
  CSL.BaseAddress.new(
    CSL.NetworkInfo.testnet_preview().network_id(),
    paymentCred(),
    stakeCred()
  ).to_address();

const paymentTx = ({ withValidityStart = false, certs, mint } = {}) => {
  const addr = testAddress();
  const inputs = CSL.TransactionInputs.new();
  inputs.add(
    CSL.TransactionInput.new(
      CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
      1
    )
  );
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      addr,
      CSL.Value.new(CSL.BigNum.from_str('2000000'))
    )
  );
  const body = CSL.TransactionBody.new_tx_body(
    inputs,
    outputs,
    CSL.BigNum.from_str('170000')
  );
  body.set_ttl(CSL.BigNum.from_str('12345'));
  if (withValidityStart) {
    body.set_validity_start_interval(99);
  }
  if (certs) body.set_certs(certs);
  if (mint) body.set_mint(mint);
  return {
    tx: CSL.Transaction.new(body, CSL.TransactionWitnessSet.new()),
    addressHex: Buffer.from(addr.to_bytes()).toString('hex'),
  };
};

const ledgerKeys = {
  payment: {
    hash: 'ab'.repeat(28),
    path: [HARDENED + 1852, HARDENED + 1815, HARDENED + 0, 0, 0],
  },
  stake: {
    hash: 'cd'.repeat(28),
    path: [HARDENED + 1852, HARDENED + 1815, HARDENED + 0, 2, 0],
  },
};

describe('txToLedger (CSL v15 payment tx)', () => {
  test('encodes a simple send without calling output.datum or ttl.to_str', async () => {
    const { tx, addressHex } = paymentTx();
    const encoded = await txToLedger(tx, 0, ledgerKeys, addressHex, 0);
    expect(encoded.tx.outputs).toHaveLength(1);
    // ARRAY_LEGACY is 0 and is stripped as falsy; Ledger treats missing as legacy.
    expect(encoded.tx.outputs[0].format).toBeUndefined();
    expect(TxOutputFormat.ARRAY_LEGACY).toBe(0);
    expect(encoded.tx.outputs[0].amount).toBe('2000000');
    expect(encoded.tx.outputs[0].datum).toBeUndefined();
    expect(encoded.tx.outputs[0].datumHashHex).toBeUndefined();
    expect(encoded.tx.inputs[0].outputIndex).toBe(1);
    expect(encoded.tx.fee).toBe('170000');
    expect(encoded.tx.ttl).toBe('12345');
    expect(encoded.tx.validityIntervalStart).toBeUndefined();
  });

  test('reads validity_start_interval as a string slot', async () => {
    const { tx, addressHex } = paymentTx({ withValidityStart: true });
    const encoded = await txToLedger(tx, 0, ledgerKeys, addressHex, 0);
    expect(encoded.tx.ttl).toBe('12345');
    expect(encoded.tx.validityIntervalStart).toBe('99');
  });

  test('encodes an inline-datum output as Babbage', async () => {
    const addr = testAddress();
    const inputs = CSL.TransactionInputs.new();
    inputs.add(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
        0
      )
    );
    const output = CSL.TransactionOutput.new(
      addr,
      CSL.Value.new(CSL.BigNum.from_str('2000000'))
    );
    output.set_plutus_data(CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')));
    const outputs = CSL.TransactionOutputs.new();
    outputs.add(output);
    const body = CSL.TransactionBody.new_tx_body(
      inputs,
      outputs,
      CSL.BigNum.from_str('170000')
    );
    body.set_ttl(CSL.BigNum.from_str('12345'));
    const tx = CSL.Transaction.new(body, CSL.TransactionWitnessSet.new());
    const encoded = await txToLedger(
      tx,
      0,
      ledgerKeys,
      Buffer.from(addr.to_bytes()).toString('hex'),
      0
    );
    expect(encoded.tx.outputs[0].format).toBe(TxOutputFormat.MAP_BABBAGE);
    expect(encoded.tx.outputs[0].datum).toEqual({
      type: DatumType.INLINE,
      datumHex: Buffer.from(
        CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')).to_bytes()
      ).toString('hex'),
    });
  });

  test('uses Preview protocol magic 2, not Byron testnet 42', async () => {
    const { tx, addressHex } = paymentTx();
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      ledgerKeys,
      addressHex,
      0
    );
    expect(encoded.tx.network).toEqual({
      networkId: 0,
      protocolMagic: 2,
    });
    const preprod = await txToLedger(
      tx,
      { id: NETWORK_ID.preprod },
      ledgerKeys,
      addressHex,
      0
    );
    expect(preprod.tx.network.protocolMagic).toBe(1);
  });

  test('encodes token names as raw bytes, not CBOR-prefixed to_hex', async () => {
    const addr = testAddress();
    const policy = CSL.ScriptHash.from_bytes(Buffer.from('11'.repeat(28), 'hex'));
    const assets = CSL.Assets.new();
    assets.insert(
      CSL.AssetName.new(Buffer.from('test')),
      CSL.BigNum.from_str('1')
    );
    const multi = CSL.MultiAsset.new();
    multi.insert(policy, assets);
    const inputs = CSL.TransactionInputs.new();
    inputs.add(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
        0
      )
    );
    const outputs = CSL.TransactionOutputs.new();
    outputs.add(
      CSL.TransactionOutput.new(
        addr,
        CSL.Value.new_with_assets(CSL.BigNum.from_str('2000000'), multi)
      )
    );
    const body = CSL.TransactionBody.new_tx_body(
      inputs,
      outputs,
      CSL.BigNum.from_str('170000')
    );
    const tx = CSL.Transaction.new(body, CSL.TransactionWitnessSet.new());
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      ledgerKeys,
      Buffer.from(addr.to_bytes()).toString('hex'),
      0
    );
    expect(encoded.tx.outputs[0].tokenBundle[0].tokens[0].assetNameHex).toBe(
      Buffer.from('test').toString('hex')
    );
    expect(encoded.tx.outputs[0].tokenBundle[0].tokens[0].assetNameHex).not.toBe(
      CSL.AssetName.new(Buffer.from('test')).to_hex()
    );
  });

  test('stake delegation uses pool_keyhash, not the removed pool()', async () => {
    const poolHash = 'ef'.repeat(28);
    const certs = CSL.Certificates.new();
    certs.add(
      CSL.Certificate.new_stake_delegation(
        CSL.StakeDelegation.new(
          stakeCred(),
          CSL.Ed25519KeyHash.from_bytes(Buffer.from(poolHash, 'hex'))
        )
      )
    );
    const { tx, addressHex } = paymentTx({ certs });
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      ledgerKeys,
      addressHex,
      0
    );
    expect(encoded.tx.certificates).toEqual([
      {
        type: CertificateType.STAKE_DELEGATION,
        params: {
          stakeCredential: {
            type: 0,
            keyPath: ledgerKeys.stake.path,
          },
          poolKeyHashHex: poolHash,
        },
      },
    ]);
  });

  test('vote delegation (kind 15) is encoded, not an empty object', async () => {
    const certs = CSL.Certificates.new();
    certs.add(
      CSL.Certificate.new_vote_delegation(
        CSL.VoteDelegation.new(stakeCred(), CSL.DRep.new_always_abstain())
      )
    );
    const { tx, addressHex } = paymentTx({ certs });
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      ledgerKeys,
      addressHex,
      0
    );
    expect(encoded.tx.certificates[0].type).toBe(CertificateType.VOTE_DELEGATION);
    expect(encoded.tx.certificates[0].params.dRep).toEqual({ type: 3 });
  });

  test('encodes a mint bundle from MintsAssets without calling .keys() on it', async () => {
    const policy = CSL.ScriptHash.from_bytes(Buffer.from('22'.repeat(28), 'hex'));
    const assets = CSL.MintAssets.new();
    assets.insert(CSL.AssetName.new(Buffer.from('test')), CSL.Int.new_i32(5));
    const mint = CSL.Mint.new();
    mint.insert(policy, assets);
    const { tx, addressHex } = paymentTx({ mint });
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      ledgerKeys,
      addressHex,
      0
    );
    expect(encoded.tx.mint[0].tokens).toEqual([
      { assetNameHex: Buffer.from('test').toString('hex'), amount: '5' },
    ]);
  });

  test('uses a distinct BIP-32 path per input', async () => {
    const { tx, addressHex } = paymentTx();
    const changePath = [HARDENED + 1852, HARDENED + 1815, HARDENED + 0, 1, 0];
    const encoded = await txToLedger(
      tx,
      { id: NETWORK_ID.preview },
      { ...ledgerKeys, inputPaths: [changePath] },
      addressHex,
      0
    );
    expect(encoded.tx.inputs[0].path).toEqual(changePath);
  });

  test('refuses certificates Ledger cannot encode instead of sending {}', async () => {
    const certs = CSL.Certificates.new();
    certs.add(
      CSL.Certificate.new_pool_retirement(
        CSL.PoolRetirement.new(
          CSL.Ed25519KeyHash.from_bytes(Buffer.from('ef'.repeat(28), 'hex')),
          100
        )
      )
    );
    const { tx, addressHex } = paymentTx({ certs });
    await expect(
      txToLedger(tx, { id: NETWORK_ID.preview }, ledgerKeys, addressHex, 0)
    ).rejects.toThrow(/kind 4/);
  });
});
