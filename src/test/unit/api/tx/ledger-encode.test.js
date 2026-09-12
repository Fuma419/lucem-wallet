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
