/**
 * Isolated Ledger encoder helpers (no Koios / util.js stack).
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  CertificateType,
  CredentialParamsType,
  DRepParamsType,
} = require('@cardano-foundation/ledgerjs-hw-app-cardano');
const {
  certificateToLedger,
  credentialParams,
  cslAssetNameHex,
  cslMintPolicyTokens,
  ledgerCertificateType,
  ledgerNetworkForWallet,
  wrapLedgerVkeyWitness,
} = require('../../../../api/tx/ledger-encode');
const { NETWORK_ID } = require('../../../../config/config');

const stakeCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from('cd'.repeat(28), 'hex'))
  );

const keys = {
  stake: {
    hash: 'cd'.repeat(28),
    path: [0x80000000 + 1852, 0x80000000 + 1815, 0x80000000, 2, 0],
  },
  drep: {
    hash: 'aa'.repeat(28),
    path: [0x80000000 + 1852, 0x80000000 + 1815, 0x80000000, 3, 0],
  },
};

describe('ledgerNetworkForWallet', () => {
  test('maps Lucem network ids to Cardano protocol magics', () => {
    expect(ledgerNetworkForWallet({ id: NETWORK_ID.preview })).toEqual({
      networkId: 0,
      protocolMagic: 2,
    });
    expect(ledgerNetworkForWallet({ id: NETWORK_ID.preprod })).toEqual({
      networkId: 0,
      protocolMagic: 1,
    });
    expect(ledgerNetworkForWallet({ id: NETWORK_ID.mainnet })).toEqual({
      networkId: 1,
      protocolMagic: 764824073,
    });
    expect(ledgerNetworkForWallet(0).protocolMagic).not.toBe(42);
  });
});

describe('cslAssetNameHex', () => {
  test('returns raw name bytes, not CBOR-prefixed to_hex', () => {
    const name = CSL.AssetName.new(Buffer.from('test'));
    expect(cslAssetNameHex(name)).toBe(Buffer.from('test').toString('hex'));
    expect(cslAssetNameHex(name)).not.toBe(name.to_hex());
    expect(name.to_hex().startsWith('44')).toBe(true);
  });
});

describe('wrapLedgerVkeyWitness', () => {
  test('Vkeywitness.new rejects a bare PublicKey; wrap uses Vkey.new', () => {
    const publicKey = CSL.PrivateKey.generate_ed25519().to_public();
    const sig = '11'.repeat(64);
    expect(() =>
      CSL.Vkeywitness.new(publicKey, CSL.Ed25519Signature.from_hex(sig))
    ).toThrow(/Vkey/);
    const witness = wrapLedgerVkeyWitness(CSL, publicKey, sig);
    expect(witness.to_bytes().length).toBeGreaterThan(0);
  });

  test('converts a Bip32PublicKey and the witness can go on a tx', () => {
    const accountPub = CSL.Bip32PrivateKey.from_bip39_entropy(
      Buffer.alloc(32, 0x42),
      Buffer.alloc(0)
    )
      .derive(0x80000000 + 1852)
      .derive(0x80000000 + 1815)
      .derive(0x80000000)
      .to_public();
    const child = accountPub.derive(0).derive(0);
    const witness = wrapLedgerVkeyWitness(CSL, child, '11'.repeat(64));
    const vkeys = CSL.Vkeywitnesses.new();
    vkeys.add(witness);
    const ws = CSL.TransactionWitnessSet.new();
    ws.set_vkeys(vkeys);
    const body = CSL.TransactionBody.new_tx_body(
      CSL.TransactionInputs.new(),
      CSL.TransactionOutputs.new(),
      CSL.BigNum.from_str('170000')
    );
    expect(() => CSL.Transaction.new(body, ws)).not.toThrow();
  });

  test('names the Vkey wrap step instead of a minified class', () => {
    expect(() =>
      wrapLedgerVkeyWitness(
        CSL,
        { as_bytes: () => new Uint8Array(4) },
        '11'.repeat(64)
      )
    ).toThrow(
      /Could not read the Ledger payment key|Could not wrap the Ledger payment key/
    );
  });
});

describe('credentialParams', () => {
  test('uses KEY_PATH only when the hash matches, else KEY_HASH', () => {
    const cred = stakeCred();
    expect(credentialParams(cred, keys.stake.hash, keys.stake.path)).toEqual({
      type: CredentialParamsType.KEY_PATH,
      keyPath: keys.stake.path,
    });
    expect(credentialParams(cred, 'ab'.repeat(28), keys.stake.path)).toEqual({
      type: CredentialParamsType.KEY_HASH,
      keyHashHex: 'cd'.repeat(28),
    });
  });
});

describe('certificateToLedger', () => {
  test('maps vote delegation kind 15', () => {
    const cert = CSL.Certificate.new_vote_delegation(
      CSL.VoteDelegation.new(stakeCred(), CSL.DRep.new_always_abstain())
    );
    expect(cert.kind()).toBe(15);
    const mapped = certificateToLedger(cert, keys);
    expect(mapped.type).toBe(CertificateType.VOTE_DELEGATION);
    expect(mapped.params.dRep).toEqual({ type: DRepParamsType.ABSTAIN });
  });

  test('maps DRep registration to the Ledger DRep credential, not the stake path', () => {
    const drepCred = CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from(keys.drep.hash, 'hex'))
    );
    const cert = CSL.Certificate.new_drep_registration(
      CSL.DRepRegistration.new(drepCred, CSL.BigNum.from_str('500000000'))
    );
    const mapped = certificateToLedger(cert, keys);
    expect(mapped.type).toBe(CertificateType.DREP_REGISTRATION);
    expect(mapped.params.dRepCredential).toEqual({
      type: CredentialParamsType.KEY_PATH,
      keyPath: keys.drep.path,
    });
    expect(mapped.params.deposit).toBe('500000000');
  });

  test('maps stake+vote delegation (kind 12) without 8.0-only enum members', () => {
    const cert = CSL.Certificate.new_stake_and_vote_delegation(
      CSL.StakeAndVoteDelegation.new(
        stakeCred(),
        CSL.Ed25519KeyHash.from_bytes(Buffer.from('ef'.repeat(28), 'hex')),
        CSL.DRep.new_always_abstain()
      )
    );
    expect(cert.kind()).toBe(12);
    const mapped = certificateToLedger(cert, keys);
    expect(mapped.type).toBe(10);
    expect(mapped.params.poolKeyHashHex).toBe('ef'.repeat(28));
    expect(mapped.params.dRep).toEqual({ type: DRepParamsType.ABSTAIN });
  });

  test('maps registration+delegation combo certs (kinds 13, 16, 14)', () => {
    const pool = CSL.Ed25519KeyHash.from_bytes(
      Buffer.from('ef'.repeat(28), 'hex')
    );
    const deposit = CSL.BigNum.from_str('2000000');
    const drep = CSL.DRep.new_always_abstain();

    const kind13 = certificateToLedger(
      CSL.Certificate.new_stake_registration_and_delegation(
        CSL.StakeRegistrationAndDelegation.new(stakeCred(), pool, deposit)
      ),
      keys
    );
    expect(kind13.type).toBe(11);
    expect(kind13.params.deposit).toBe('2000000');

    const kind16 = certificateToLedger(
      CSL.Certificate.new_vote_registration_and_delegation(
        CSL.VoteRegistrationAndDelegation.new(stakeCred(), drep, deposit)
      ),
      keys
    );
    expect(kind16.type).toBe(12);
    expect(kind16.params.dRep).toEqual({ type: DRepParamsType.ABSTAIN });

    const kind14 = certificateToLedger(
      CSL.Certificate.new_stake_vote_registration_and_delegation(
        CSL.StakeVoteRegistrationAndDelegation.new(
          stakeCred(),
          pool,
          drep,
          deposit
        )
      ),
      keys
    );
    expect(kind14.type).toBe(13);
    expect(kind14.params.poolKeyHashHex).toBe('ef'.repeat(28));
  });

  test('throws on pool retirement instead of pushing {}', () => {
    const cert = CSL.Certificate.new_pool_retirement(
      CSL.PoolRetirement.new(
        CSL.Ed25519KeyHash.from_bytes(Buffer.from('ef'.repeat(28), 'hex')),
        100
      )
    );
    expect(() => certificateToLedger(cert, keys)).toThrow(/kind 4/);
  });
});

describe('cslMintPolicyTokens', () => {
  test('walks MintsAssets lists from CSL v15 Mint.get', () => {
    const policy = CSL.ScriptHash.from_bytes(Buffer.from('22'.repeat(28), 'hex'));
    const assets = CSL.MintAssets.new();
    assets.insert(CSL.AssetName.new(Buffer.from('test')), CSL.Int.new_i32(5));
    const mint = CSL.Mint.new();
    mint.insert(policy, assets);
    const group = mint.get(policy);
    expect(typeof group.keys).toBe('undefined');
    expect(cslMintPolicyTokens(mint, policy)).toEqual([
      { assetNameHex: Buffer.from('test').toString('hex'), amount: '5' },
    ]);
  });
});

describe('ledgerCertificateType', () => {
  test('uses installed enum members and falls back to the 8.0 wire value', () => {
    expect(ledgerCertificateType('STAKE_DELEGATION', 99)).toBe(
      CertificateType.STAKE_DELEGATION
    );
    expect(ledgerCertificateType('NOT_A_LEDGER_CERT', 10)).toBe(10);
    expect(ledgerCertificateType('STAKE_POOL_AND_DREP_DELEGATION', 10)).toBe(
      10
    );
  });

  test('encoder source does not read CertificateType members 7.x typings omit', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/tx/ledger-encode.js'),
      'utf8'
    );
    expect(src).not.toContain('CertificateType.STAKE_POOL_AND_DREP_DELEGATION');
    expect(src).not.toMatch(
      /CertificateType\.ACCOUNT_REGISTRATION_DELEGATION_TO_STAKE_POOL(?!_AND_DREP)/
    );
    expect(src).not.toContain(
      'CertificateType.ACCOUNT_REGISTRATION_DELEGATION_TO_DREP'
    );
    expect(src).not.toContain(
      'CertificateType.ACCOUNT_REGISTRATION_DELEGATION_TO_STAKE_POOL_AND_DREP'
    );
  });
});

describe('signing.js uses Vkey wrap', () => {
  test('does not pass a PublicKey into Vkeywitness.new', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/extension/signing.js'),
      'utf8'
    );
    expect(src).toMatch(/wrapLedgerVkeyWitness\(/);
    expect(src).not.toMatch(/Vkeywitness\.new\(\s*publicKey/);
  });
});

describe('assembleSignedTransaction skips non-AuxiliaryData', () => {
  test('wallet.ts only passes aux when it has to_bytes', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/extension/wallet.ts'),
      'utf8'
    );
    expect(src).toMatch(/typeof aux\.to_bytes === 'function'/);
    expect(src).not.toMatch(
      /Transaction\.new\(\s*unsignedTx\.body\(\),\s*witnessSet,\s*unsignedTx\.auxiliary_data\(\)/
    );
  });
});
