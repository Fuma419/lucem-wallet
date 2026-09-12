/**
 * CIP-30 signData / signTx / submitTx and hardware witness paths.
 * Depends on ./keys and ./storage; does not import ./index or ./wallet.
 */
import { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';
import { Serialization } from '@cardano-sdk/core';
import { isAddress } from 'web3-validator';
import {
  APIError,
  DataSignError,
  HW,
  NETWORK_ID,
  STORAGE,
  TREZOR_UNSUPPORTED,
  TxSignError,
} from '../../config/config';
import { nativeSafeBinaryBody } from '../../platform/capacitor';
import { invalidateAll as invalidateReadCache } from '../cache';
import Loader from '../loader';
import { buildVkeyWitnessSet } from '../tx/sign-witness-set';
import {
  koiosSubmitTransaction,
  networkNameToId,
  txToLedger,
} from '../util';
import { ADDRESS_ROLE, getExternalIndices, getInternalIndices, listEnabledPaymentAddresses } from './multi-address';
import { deriveAccountDRepKeyHashHex, deriveAccountDRepPrivateKey, requestAccountKey } from './keys';
import { assertLedgerAccountMatches } from './ledger-account';
import { getNetwork, getStorage } from './storage';
import { recordSubmittedTx } from '../tx/pending-history';
import { ledgerInputPaths, ledgerPathsForInputs } from '../tx/cip30-input-key-hashes';
import {
  ledgerNetworkForWallet,
  wrapLedgerVkeyWitness,
} from '../tx/ledger-encode';
import { txBodyCollateral } from '../tx/csl-tx-accessors';


const hasTaggedSets = (cbor) => {
  try {
    const parsed = Serialization.Transaction.fromCbor(cbor);
    return txHasTaggedSets(parsed);
  } catch (/** @type {any} */ _) {
    return true;
  }
};

const txHasTaggedSets = (tx) => {
  const body = tx && typeof tx.body === 'function' ? tx.body() : null;
  if (body && typeof body.hasTaggedSets === 'function') {
    return Boolean(body.hasTaggedSets());
  }
  return true;
};

const isValidAddressBytes = async (address) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const addr = Loader.Cardano.Address.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 &&
        (network.id === NETWORK_ID.testnet ||
          network.id === NETWORK_ID.preview ||
          network.id === NETWORK_ID.preprod))
    )
      return true;
    return false;
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.ByronAddress.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 &&
        (network.id === NETWORK_ID.testnet ||
          network.id === NETWORK_ID.preview ||
          network.id === NETWORK_ID.preprod))
    )
      return true;
    return false;
  } catch (/** @type {any} */ e) {}
  return false;
};

export const isValidEthAddress = function (address) {
  return isAddress(address);
};

const DREP_ID_HEX_RE = /^[0-9a-f]{56}$/i;

export const extractKeyHash = async (address) => {
  await Loader.load();
  if (DREP_ID_HEX_RE.test(address)) {
    return `drep_vkh${address.toLowerCase()}`;
  }
  if (!(await isValidAddressBytes(Buffer.from(address, 'hex'))))
    throw DataSignError.InvalidFormat;
  try {
    const addr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.EnterpriseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.PointerAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.RewardAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('stake_vkh');
  } catch (/** @type {any} */ e) {}
  throw DataSignError.AddressNotPK;
};

export const extractKeyOrScriptHash = async (address) => {
  await Loader.load();
  if (!(await isValidAddressBytes(Buffer.from(address, 'hex'))))
    throw DataSignError.InvalidFormat;
  try {
    const addr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );

    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.EnterpriseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.PointerAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (/** @type {any} */ e) {}
  try {
    const addr = Loader.Cardano.RewardAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('stake_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (/** @type {any} */ e) {}
  throw new Error('No address type matched.');
};

export const verifySigStructure = async (sigStructure) => {
  await Loader.load();
  try {
    Loader.Message.SigStructure.from_bytes(Buffer.from(sigStructure, 'hex'));
  } catch (/** @type {any} */ e) {
    throw DataSignError.InvalidFormat;
  }
};

export const verifyPayload = (payload) => {
  if (Buffer.from(payload, 'hex').length <= 0)
    throw DataSignError.InvalidFormat;
};

export const verifyTx = async (tx) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const parseTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
    let networkId = parseTx.body().network_id()
      ? parseTx.body().network_id().network()
      : null;
    if (!networkId && networkId != 0) {
      networkId = parseTx.body().outputs().get(0).address().network_id();
    }
    if (networkId != networkNameToId(network.id)) throw Error('Wrong network');
  } catch (/** @type {any} */ e) {
    throw APIError.InvalidRequest;
  }
};

/**
 * @param {string} address - cbor
 * @param {string} payload - hex encoded utf8 string
 * @param {string} password
 * @param {number} accountIndex
 * @returns
 */

//deprecated soon
export const signData = async (address, payload, password, accountIndex) => {
  await Loader.load();
  const keyHash = await extractKeyHash(address);
  const prefix = keyHash.startsWith('addr_vkh')
    ? 'addr_vkh'
    : keyHash.startsWith('drep_vkh')
      ? 'drep_vkh'
      : 'stake_vkh';
  const sdAccounts = await getStorage(STORAGE.accounts);
  const sdAccount = sdAccounts?.[accountIndex];
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    sdAccount?.derivationIndex ?? accountIndex,
    sdAccount?.walletId ?? null
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const signingKey =
    prefix === 'addr_vkh' ? paymentKey : prefix === 'drep_vkh' ? drepKey : stakeKey;

  const publicKey = signingKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;

  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  protectedHeaders.set_key_id(publicKey.as_bytes());
  protectedHeaders.set_header(
    Loader.Message.Label.new_text('address'),
    Loader.Message.CBORValue.new_bytes(Buffer.from(address, 'hex'))
  );
  const protectedSerialized =
    Loader.Message.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = Loader.Message.HeaderMap.new();
  const headers = Loader.Message.Headers.new(
    protectedSerialized,
    unprotectedHeaders
  );
  const builder = Loader.Message.COSESign1Builder.new(
    headers,
    Buffer.from(payload, 'hex'),
    false
  );
  const toSign = builder.make_data_to_sign().to_bytes();

  const signedSigStruc = signingKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

  accountKey.free();
  accountKey = null;
  drepKey.free();
  drepKey = null;
  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  return Buffer.from(coseSign1.to_bytes(), 'hex').toString('hex');
};

export const signDataCIP30 = async (
  address,
  payload,
  password,
  accountIndex
) => {
  await Loader.load();
  const keyHash = await extractKeyHash(address);
  const prefix = keyHash.startsWith('addr_vkh')
    ? 'addr_vkh'
    : keyHash.startsWith('drep_vkh')
      ? 'drep_vkh'
      : 'stake_vkh';
  const cip30Accounts = await getStorage(STORAGE.accounts);
  const cip30Account = cip30Accounts?.[accountIndex];
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    cip30Account?.derivationIndex ?? accountIndex,
    cip30Account?.walletId ?? null
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const signingKey =
    prefix === 'addr_vkh' ? paymentKey : prefix === 'drep_vkh' ? drepKey : stakeKey;

  const publicKey = signingKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;
  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  // protectedHeaders.set_key_id(publicKey.to_raw_bytes()); // Removed to adhere to CIP-30
  protectedHeaders.set_header(
    Loader.Message.Label.new_text('address'),
    Loader.Message.CBORValue.new_bytes(
      Buffer.from(
        prefix === 'drep_vkh' ? publicKey.hash().to_hex() : address,
        'hex'
      )
    )
  );
  const protectedSerialized =
    Loader.Message.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = Loader.Message.HeaderMap.new();
  const headers = Loader.Message.Headers.new(
    protectedSerialized,
    unprotectedHeaders
  );
  const builder = Loader.Message.COSESign1Builder.new(
    headers,
    Buffer.from(payload, 'hex'),
    false
  );
  const toSign = builder.make_data_to_sign().to_bytes();

  const signedSigStruc = signingKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

  accountKey.free();
  accountKey = null;
  drepKey.free();
  drepKey = null;
  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  const key = Loader.Message.COSEKey.new(
    Loader.Message.Label.from_key_type(Loader.Message.KeyType.OKP)
  );
  key.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  key.set_header(
    Loader.Message.Label.new_int(
      Loader.Message.Int.new_negative(Loader.Message.BigNum.from_str('1'))
    ),
    Loader.Message.CBORValue.new_int(
      Loader.Message.Int.new_i32(6) //Loader.Message.CurveType.Ed25519
    )
  ); // crv (-1) set to Ed25519 (6)
  key.set_header(
    Loader.Message.Label.new_int(
      Loader.Message.Int.new_negative(Loader.Message.BigNum.from_str('2'))
    ),
    Loader.Message.CBORValue.new_bytes(publicKey.as_bytes())
  ); // x (-2) set to public key

  return {
    signature: Buffer.from(coseSign1.to_bytes()).toString('hex'),
    key: Buffer.from(key.to_bytes()).toString('hex'),
  };
};

/**
 *
 * @param {string} tx - cbor hex string
 * @param {Array<string>} keyHashes
 * @param {string} password
 * @returns {Promise<string>} witness set as hex string
 */
export const signTx = async (
  tx,
  keyHashes,
  password,
  accountIndex,
  partialSign = false
) => {
  await Loader.load();
  // `accountIndex` is the storage slot. Resolve the seed + CIP-1852 index it maps
  // to so multi-seed accounts sign with the correct root key (legacy accounts
  // fall back to slot == derivation index, walletId "0").
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[accountIndex];
  const derivationIndex = account?.derivationIndex ?? accountIndex;
  const walletId = account?.walletId ?? null;
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    derivationIndex,
    walletId
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const paymentKeyHash = paymentKey.to_public().hash().to_hex();
  const stakeKeyHash = stakeKey.to_public().hash().to_hex();
  const drepKeyHash = drepKey.to_public().hash().to_hex();

  const keyMap = new Map([
    [paymentKeyHash, paymentKey],
    [stakeKeyHash, stakeKey],
    [drepKeyHash, drepKey],
  ]);

  // Advanced multi-address: include payment keys for every enabled external and
  // internal (change) index so inputs on those addresses can be witnessed.
  const extraPaymentKeys = [];
  for (const addressIndex of getExternalIndices(account).filter((i) => i !== 0)) {
    const extraKey = accountKey.derive(0).derive(addressIndex).to_raw_key();
    extraPaymentKeys.push(extraKey);
    keyMap.set(extraKey.to_public().hash().to_hex(), extraKey);
  }
  for (const addressIndex of getInternalIndices(account)) {
    const extraKey = accountKey.derive(1).derive(addressIndex).to_raw_key();
    extraPaymentKeys.push(extraKey);
    keyMap.set(extraKey.to_public().hash().to_hex(), extraKey);
  }

  let txWitnessSet;
  try {
    txWitnessSet = buildVkeyWitnessSet(
      Loader.Cardano,
      tx,
      keyMap,
      keyHashes,
      partialSign
    );
  } catch {
    throw TxSignError.ProofGeneration;
  } finally {
    accountKey.free();
    drepKey.free();
    stakeKey.free();
    paymentKey.free();
    extraPaymentKeys.forEach((k) => {
      try {
        k.free();
      } catch (/** @type {any} */ _) {
        /* ignore */
      }
    });
  }

  return txWitnessSet;
};

export const signTxHW = async (
  tx,
  keyHashes,
  account,
  hw,
  partialSign = false
) => {
  await Loader.load();
  const rawTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
  const address = Loader.Cardano.Address.from_bech32(account.paymentAddr);
  const walletNetwork = await getNetwork();
  const ledgerNetwork = ledgerNetworkForWallet(
    walletNetwork || { networkId: address.network_id() }
  );
  const networkId = address.network_id();
  /** @type {any} */
  const keys = {
    payment: { hash: null, path: null },
    stake: { hash: null, path: null },
    drep: { hash: null, path: null },
  };
  if (hw.device === HW.ledger) {
    const appAda = hw.appAda;
    // Passphrase wallets share a device and a derivation path, so the wrong
    // one would sign with the wrong key and submit an invalid witness.
    if (appAda && account?.publicKey) {
      await assertLedgerAccountMatches({
        appAda,
        account: hw.account,
        expectedPublicKeyHex: account.publicKey,
      });
    }
    const paymentIndexByHash = {};
    if (account?.publicKey) {
      for (const row of listEnabledPaymentAddresses(
        Loader.Cardano,
        account,
        networkId
      )) {
        const hash = String(row.paymentKeyHash || '').toLowerCase();
        if (!hash) continue;
        if (!row.paymentAddr) continue;
        let addressHex;
        try {
          addressHex = Buffer.from(
            Loader.Cardano.Address.from_bech32(row.paymentAddr).to_bytes()
          ).toString('hex');
        } catch (/** @type {any} */ _) {
          continue;
        }
        paymentIndexByHash[hash] = {
          index: row.index,
          role: row.role ?? ADDRESS_ROLE.external,
          addressHex,
        };
      }
    } else if (account.paymentKeyHash) {
      paymentIndexByHash[String(account.paymentKeyHash).toLowerCase()] = {
        index: 0,
        role: ADDRESS_ROLE.external,
        addressHex: Buffer.from(address.to_bytes()).toString('hex'),
      };
    }
    const drepKeyHash = account?.publicKey
      ? deriveAccountDRepKeyHashHex(account.publicKey)
      : null;
    const paymentPathByHash = /** @type {Record<string, number[]>} */ ({});
    keyHashes.forEach((keyHash) => {
      const hash = String(keyHash || '').toLowerCase();
      if (paymentIndexByHash[hash] != null) {
        const { index: addrIdx, role } = paymentIndexByHash[hash];
        const path = [
          HARDENED + 1852,
          HARDENED + 1815,
          HARDENED + hw.account,
          role,
          addrIdx,
        ];
        keys.payment = { hash, path };
        paymentPathByHash[hash] = path;
      } else if (hash === String(account.stakeKeyHash || '').toLowerCase())
        keys.stake = {
          hash,
          path: [HARDENED + 1852, HARDENED + 1815, HARDENED + hw.account, 2, 0],
        };
      else if (
        drepKeyHash &&
        hash === String(drepKeyHash).toLowerCase()
      )
        keys.drep = {
          hash,
          path: [
            HARDENED + 1852,
            HARDENED + 1815,
            HARDENED + hw.account,
            ADDRESS_ROLE.drep,
            0,
          ],
        };
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
    });
    keys.ownedDestinations = Object.values(paymentIndexByHash)
      .filter((row) => row.addressHex)
      .map((row) => ({
        addressHex: row.addressHex,
        path: [
          HARDENED + 1852,
          HARDENED + 1815,
          HARDENED + hw.account,
          row.role,
          row.index,
        ],
      }));
    keys.paymentPathByHash = paymentPathByHash;
    try {
      const { getUtxos } = await import('./chain-reads');
      const utxos = (await getUtxos(undefined, undefined, account)) || [];
      keys.inputPaths = ledgerInputPaths(
        Loader.Cardano,
        rawTx,
        utxos,
        paymentPathByHash,
        keys.payment.path
      );
      keys.collateralPaths = ledgerPathsForInputs(
        Loader.Cardano,
        txBodyCollateral(rawTx.body()),
        utxos,
        paymentPathByHash,
        keys.payment.path
      );
    } catch (/** @type {any} */ _) {
      keys.inputPaths = [];
      keys.collateralPaths = [];
    }
    const ledgerTx = await txToLedger(
      rawTx,
      ledgerNetwork,
      keys,
      Buffer.from(address.to_bytes()).toString('hex'),
      hw.account
    );
    const result = await appAda.signTransaction({
      ...ledgerTx,
      options: {
        tagCborSets: hasTaggedSets(tx),
      },
    });
    try {
      const witnessSet = Loader.Cardano.TransactionWitnessSet.new();
      const vkeys = Loader.Cardano.Vkeywitnesses.new();
      result.witnesses.forEach((witness) => {
        const role = witness.path[3];
        const addrIdx = witness.path[4] != null ? witness.path[4] : 0;
        if (role === 0 || role === 1 || role === 2 || role === ADDRESS_ROLE.drep) {
          const publicKey = Loader.Cardano.Bip32PublicKey.from_hex(
            account.publicKey
          )
            .derive(role === 2 ? 2 : role)
            .derive(role === 2 ? 0 : addrIdx)
            .to_raw_key();
          vkeys.add(
            wrapLedgerVkeyWitness(
              Loader.Cardano,
              publicKey,
              witness.witnessSignatureHex
            )
          );
        }
      });
      witnessSet.set_vkeys(vkeys);
      return witnessSet;
    } catch (/** @type {any} */ err) {
      const detail = err && err.message ? String(err.message) : String(err);
      throw new Error(
        `Ledger signed the transaction, but Lucem could not attach the signature. ${detail}`
      );
    }
  }
  if (hw.device === HW.keystone) {
    throw new Error('Keystone signing runs in the Keystone signing tab.');
  }
  if (hw.device === HW.trezor) {
    throw new Error(TREZOR_UNSUPPORTED);
  }
  throw new Error('Unsupported hardware wallet device');
};

const rememberSubmitted = async (txHex, result) => {
  try {
    await recordSubmittedTx(txHex, result);
  } catch (/** @type {any} */ error) {
    console.warn(
      'Could not record pending history after submit:',
      error?.message || error
    );
  }
};

/**
 *
 * @param {string} tx - cbor hex string
 * @returns
 */
export const submitTx = async (tx) => {
  const network = await getNetwork();
  
  // Convert CBOR to hex if needed
  const txHex = typeof tx === 'string' ? tx : Buffer.from(tx).toString('hex');
  
  if (network[network.id + 'Submit']) {
    const result = await fetch(network[network.id + 'Submit'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/cbor' },
      body: nativeSafeBinaryBody(Buffer.from(txHex, 'hex'), 'application/cbor'),
    });
    if (result.ok) {
      // Balance/UTxO/history caches are now stale — drop them so the next read
      // reflects the just-submitted transaction.
      invalidateReadCache();
      const payload = await result.json();
      await rememberSubmitted(txHex, payload);
      return payload;
    }
    throw APIError.InvalidRequest;
  }
  
  try {
    const result = await koiosSubmitTransaction(txHex);
    invalidateReadCache();
    await rememberSubmitted(txHex, result);
    return result;
  } catch (/** @type {any} */ error) {
    console.error('Koios transaction submission error:', error);
    throw new Error(`Transaction submission failed: ${error.message}`);
  }
};

