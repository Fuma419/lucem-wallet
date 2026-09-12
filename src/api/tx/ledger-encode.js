/**
 * Ledger (hw-app-cardano) encoding helpers that must track CSL v15.
 * Kept out of util.js so unit tests can load them without the Koios stack.
 */

import {
  CertificateType,
  CredentialParamsType,
  DRepParamsType,
} from '@cardano-foundation/ledgerjs-hw-app-cardano';
import { NETWORK_ID } from '../../config/config';
import { optionalUintToStr } from './csl-tx-accessors';

/** Cardano protocol magics (Byron-era `42` is not Preview/Preprod). */
export const LEDGER_PROTOCOL_MAGIC = {
  mainnet: 764824073,
  preprod: 1,
  preview: 2,
  testnet: 1097911063,
};

/**
 * @param {unknown} network wallet `{ id }`, CSL network id, or `{ networkId, protocolMagic }`
 * @returns {{ networkId: number, protocolMagic: number }}
 */
export const ledgerNetworkForWallet = (/** @type {any} */ network) => {
  if (network && typeof network === 'object') {
    if (network.protocolMagic != null && network.networkId != null) {
      return {
        networkId: Number(network.networkId),
        protocolMagic: Number(network.protocolMagic),
      };
    }
    const id = network.id || network.name;
    if (id === NETWORK_ID.mainnet) {
      return { networkId: 1, protocolMagic: LEDGER_PROTOCOL_MAGIC.mainnet };
    }
    if (id === NETWORK_ID.preprod) {
      return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.preprod };
    }
    if (id === NETWORK_ID.preview) {
      return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.preview };
    }
    if (id === NETWORK_ID.testnet) {
      return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.testnet };
    }
  }
  if (network === 1 || network === '1' || network === NETWORK_ID.mainnet) {
    return { networkId: 1, protocolMagic: LEDGER_PROTOCOL_MAGIC.mainnet };
  }
  if (network === NETWORK_ID.preprod) {
    return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.preprod };
  }
  if (network === NETWORK_ID.preview) {
    return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.preview };
  }
  return { networkId: 0, protocolMagic: LEDGER_PROTOCOL_MAGIC.testnet };
};

/**
 * AssetName.to_hex() is CBOR-prefixed on CSL v15 (`44` + name). Ledger
 * wants the raw name bytes, same as valueToAssets.
 * @param {any} assetName
 * @returns {string}
 */
export const cslAssetNameHex = (assetName) => {
  if (!assetName) return '';
  if (typeof assetName.name === 'function') {
    return Buffer.from(assetName.name()).toString('hex');
  }
  if (typeof assetName.to_hex === 'function') return assetName.to_hex();
  return '';
};

/**
 * CSL v15 `Mint.get(policy)` returns `MintsAssets` (a list of MintAssets),
 * not a map with `.keys()`. Walking `.keys()` throws and aborts Ledger
 * signing after the user already confirmed a mint on the device.
 * @param {any} mint
 * @param {any} policy
 * @returns {{ assetNameHex: string, amount: string }[]}
 */
export const cslMintPolicyTokens = (mint, policy) => {
  const tokens = [];
  const pushAssets = (assets) => {
    if (!assets) return;
    if (typeof assets.keys === 'function') {
      for (let k = 0; k < assets.keys().len(); k++) {
        const assetName = assets.keys().get(k);
        const amount = assets.get(assetName);
        tokens.push({
          assetNameHex: cslAssetNameHex(assetName),
          amount:
            amount && typeof amount.to_str === 'function'
              ? amount.to_str()
              : String(amount),
        });
      }
      return;
    }
    if (typeof assets.len === 'function' && typeof assets.get === 'function') {
      for (let i = 0; i < assets.len(); i++) pushAssets(assets.get(i));
    }
  };
  if (mint && policy && typeof mint.get === 'function') {
    pushAssets(mint.get(policy));
  }
  return tokens;
};

const cslStepError = (step, err) => {
  const detail = err && err.message ? String(err.message) : String(err || '');
  return new Error(`${step}: ${detail}`);
};

const coerceCslPublicKey = (Cardano, publicKey) => {
  if (!publicKey) throw new Error('Missing public key for Ledger witness');
  const raw =
    typeof publicKey.to_raw_key === 'function'
      ? publicKey.to_raw_key()
      : publicKey;
  if (typeof raw.as_bytes === 'function' && Cardano.PublicKey?.from_bytes) {
    return Cardano.PublicKey.from_bytes(new Uint8Array(raw.as_bytes()));
  }
  if (typeof raw.to_hex === 'function' && Cardano.PublicKey?.from_hex) {
    return Cardano.PublicKey.from_hex(raw.to_hex());
  }
  return raw;
};

const coerceCslSignature = (Cardano, signatureHex) => {
  const hex = String(signatureHex || '')
    .trim()
    .replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Ledger returned an unreadable signature');
  }
  if (typeof Cardano.Ed25519Signature.from_bytes === 'function') {
    return Cardano.Ed25519Signature.from_bytes(
      new Uint8Array(Buffer.from(hex, 'hex'))
    );
  }
  return Cardano.Ed25519Signature.from_hex(hex);
};

/**
 * CSL `Vkeywitness.new` takes a `Vkey`, not a `PublicKey`. Production
 * webpack minifies that to `expected instance of Ri` after the device
 * already signed.
 * @param {any} Cardano
 * @param {any} publicKey CSL PublicKey or Bip32PublicKey
 * @param {string} signatureHex
 */
export const wrapLedgerVkeyWitness = (Cardano, publicKey, signatureHex) => {
  if (!Cardano || typeof Cardano.Vkey?.new !== 'function') {
    throw new Error('CSL Vkey.new is required to assemble a Ledger witness');
  }
  let pk;
  try {
    pk = coerceCslPublicKey(Cardano, publicKey);
  } catch (/** @type {any} */ err) {
    throw cslStepError('Could not read the Ledger payment key', err);
  }
  let vkey;
  try {
    vkey = Cardano.Vkey.new(pk);
  } catch (/** @type {any} */ err) {
    throw cslStepError(
      'Could not wrap the Ledger payment key as a Vkey',
      err
    );
  }
  let signature;
  try {
    signature = coerceCslSignature(Cardano, signatureHex);
  } catch (/** @type {any} */ err) {
    throw cslStepError('Could not read the Ledger signature', err);
  }
  try {
    return Cardano.Vkeywitness.new(vkey, signature);
  } catch (/** @type {any} */ err) {
    throw cslStepError(
      'Could not attach the Ledger signature to the vkey',
      err
    );
  }
};

const bytesHex = (value) =>
  value ? Buffer.from(value.to_bytes()).toString('hex') : '';

const sameHex = (a, b) =>
  Boolean(a) &&
  Boolean(b) &&
  String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Ledger parseCredential wants KEY_PATH only when we actually own the key.
 * Script hashes must be `scriptHashHex` (not the old `scriptHash` field).
 * @param {any} credential
 * @param {string | null} [ownedHash]
 * @param {number[] | null} [path]
 */
export const credentialParams = (credential, ownedHash, path) => {
  if (credential && credential.kind() === 0) {
    const keyHashHex = bytesHex(credential.to_keyhash());
    if (path && sameHex(ownedHash, keyHashHex)) {
      return { type: CredentialParamsType.KEY_PATH, keyPath: path };
    }
    return { type: CredentialParamsType.KEY_HASH, keyHashHex };
  }
  return {
    type: CredentialParamsType.SCRIPT_HASH,
    scriptHashHex: bytesHex(credential.to_scripthash()),
  };
};

const stakeCredentialParams = (credential, keys) =>
  credentialParams(credential, keys?.stake?.hash, keys?.stake?.path);

const dRepCredentialParams = (credential, keys) =>
  credentialParams(credential, keys?.drep?.hash, keys?.drep?.path);

const dRepParams = (drep, keys) => {
  const kind = drep && typeof drep.kind === 'function' ? drep.kind() : -1;
  if (kind === 2) return { type: DRepParamsType.ABSTAIN };
  if (kind === 3) return { type: DRepParamsType.NO_CONFIDENCE };
  if (kind === 0) {
    const keyHashHex = bytesHex(drep.to_key_hash());
    if (keyHashHex && keys?.drep?.path && sameHex(keys.drep.hash, keyHashHex)) {
      return { type: DRepParamsType.KEY_PATH, keyPath: keys.drep.path };
    }
    return { type: DRepParamsType.KEY_HASH, keyHashHex };
  }
  if (kind === 1) {
    return {
      type: DRepParamsType.SCRIPT_HASH,
      scriptHashHex: bytesHex(drep.to_script_hash()),
    };
  }
  throw new Error(`Unsupported DRep kind for Ledger: ${kind}`);
};

export const stakeDelegationPoolHashHex = (delegation) => {
  const pool =
    delegation && typeof delegation.pool_keyhash === 'function'
      ? delegation.pool_keyhash()
      : delegation && typeof delegation.pool === 'function'
        ? delegation.pool()
        : null;
  if (!pool) {
    throw new Error('Stake delegation is missing a pool key hash');
  }
  return bytesHex(pool);
};

export const unitIntervalToLedger = (margin) => {
  if (!margin) return { numerator: '0', denominator: '1' };
  const num =
    typeof margin.numerator === 'function' ? margin.numerator() : margin.start();
  const den =
    typeof margin.denominator === 'function'
      ? margin.denominator()
      : margin.end();
  return {
    numerator: optionalUintToStr(num) || '0',
    denominator: optionalUintToStr(den) || '1',
  };
};

const optionalCoinStr = (holder) => {
  if (!holder || typeof holder.coin !== 'function') return null;
  return optionalUintToStr(holder.coin());
};

const dnsNameString = (dns) => {
  if (!dns) return null;
  if (typeof dns.record === 'function') return dns.record();
  return typeof dns === 'string' ? dns : null;
};

export const cslAnchorToLedger = (anchor) => {
  if (!anchor) return null;
  try {
    return {
      url: anchor.url().url(),
      hashHex: bytesHex(anchor.anchor_data_hash()),
    };
  } catch (/** @type {any} */ _) {
    return null;
  }
};

/**
 * Map one CSL certificate to Ledger's Certificate. Throws on kinds we
 * cannot encode — never send an empty `{}`.
 * @param {any} cert
 * @param {any} keys
 * @returns {object | null}
 */
export const certificateToLedger = (cert, keys) => {
  if (!cert || typeof cert.kind !== 'function') return null;
  const kind = cert.kind();

  if (kind === 0) {
    const params = cert.as_stake_registration();
    const deposit = optionalCoinStr(params);
    return {
      type: deposit
        ? CertificateType.STAKE_REGISTRATION_CONWAY
        : CertificateType.STAKE_REGISTRATION,
      params: {
        stakeCredential: stakeCredentialParams(params.stake_credential(), keys),
        ...(deposit ? { deposit } : {}),
      },
    };
  }
  if (kind === 1) {
    const params = cert.as_stake_deregistration();
    const deposit = optionalCoinStr(params);
    return {
      type: deposit
        ? CertificateType.STAKE_DEREGISTRATION_CONWAY
        : CertificateType.STAKE_DEREGISTRATION,
      params: {
        stakeCredential: stakeCredentialParams(params.stake_credential(), keys),
        ...(deposit ? { deposit } : {}),
      },
    };
  }
  if (kind === 2) {
    const delegation = cert.as_stake_delegation();
    return {
      type: CertificateType.STAKE_DELEGATION,
      params: {
        stakeCredential: stakeCredentialParams(
          delegation.stake_credential(),
          keys
        ),
        poolKeyHashHex: stakeDelegationPoolHashHex(delegation),
      },
    };
  }
  if (kind === 15) {
    const vote = cert.as_vote_delegation();
    return {
      type: CertificateType.VOTE_DELEGATION,
      params: {
        stakeCredential: stakeCredentialParams(vote.stake_credential(), keys),
        dRep: dRepParams(vote.drep(), keys),
      },
    };
  }
  if (kind === 12) {
    const both = cert.as_stake_and_vote_delegation();
    return {
      type: CertificateType.STAKE_POOL_AND_DREP_DELEGATION,
      params: {
        stakeCredential: stakeCredentialParams(both.stake_credential(), keys),
        poolKeyHashHex: stakeDelegationPoolHashHex(both),
        dRep: dRepParams(both.drep(), keys),
      },
    };
  }
  if (kind === 13) {
    const row = cert.as_stake_registration_and_delegation();
    return {
      type: CertificateType.ACCOUNT_REGISTRATION_DELEGATION_TO_STAKE_POOL,
      params: {
        stakeCredential: stakeCredentialParams(row.stake_credential(), keys),
        poolKeyHashHex: stakeDelegationPoolHashHex(row),
        deposit: optionalCoinStr(row) || '0',
      },
    };
  }
  if (kind === 16) {
    const row = cert.as_vote_registration_and_delegation();
    return {
      type: CertificateType.ACCOUNT_REGISTRATION_DELEGATION_TO_DREP,
      params: {
        stakeCredential: stakeCredentialParams(row.stake_credential(), keys),
        dRep: dRepParams(row.drep(), keys),
        deposit: optionalCoinStr(row) || '0',
      },
    };
  }
  if (kind === 14) {
    const row = cert.as_stake_vote_registration_and_delegation();
    return {
      type: CertificateType.ACCOUNT_REGISTRATION_DELEGATION_TO_STAKE_POOL_AND_DREP,
      params: {
        stakeCredential: stakeCredentialParams(row.stake_credential(), keys),
        poolKeyHashHex: stakeDelegationPoolHashHex(row),
        dRep: dRepParams(row.drep(), keys),
        deposit: optionalCoinStr(row) || '0',
      },
    };
  }
  if (kind === 10) {
    const row = cert.as_drep_registration();
    return {
      type: CertificateType.DREP_REGISTRATION,
      params: {
        dRepCredential: dRepCredentialParams(row.voting_credential(), keys),
        deposit: optionalCoinStr(row) || '0',
        anchor: cslAnchorToLedger(row.anchor()),
      },
    };
  }
  if (kind === 9) {
    const row = cert.as_drep_deregistration();
    return {
      type: CertificateType.DREP_DEREGISTRATION,
      params: {
        dRepCredential: dRepCredentialParams(row.voting_credential(), keys),
        deposit: optionalCoinStr(row) || '0',
      },
    };
  }
  if (kind === 11) {
    const row = cert.as_drep_update();
    return {
      type: CertificateType.DREP_UPDATE,
      params: {
        dRepCredential: dRepCredentialParams(row.voting_credential(), keys),
        anchor: cslAnchorToLedger(row.anchor()),
      },
    };
  }
  if (kind === 7) {
    const row = cert.as_committee_hot_auth();
    return {
      type: CertificateType.AUTHORIZE_COMMITTEE_HOT,
      params: {
        coldCredential: credentialParams(
          row.committee_cold_credential(),
          null,
          null
        ),
        hotCredential: credentialParams(row.committee_hot_credential(), null, null),
      },
    };
  }
  if (kind === 8) {
    const row = cert.as_committee_cold_resign();
    return {
      type: CertificateType.RESIGN_COMMITTEE_COLD,
      params: {
        coldCredential: credentialParams(
          row.committee_cold_credential(),
          null,
          null
        ),
        anchor: cslAnchorToLedger(row.anchor()),
      },
    };
  }
  // kind 3 pool registration is handled by the caller (relays / owners).
  if (kind === 3) return null;
  throw new Error(
    `This transaction has a certificate Lucem cannot sign on Ledger yet (kind ${kind}).`
  );
};

export const relayDnsName = dnsNameString;
