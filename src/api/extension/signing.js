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
  txToTrezor,
} from '../util';
import { ADDRESS_ROLE, getExternalIndices, getInternalIndices, listEnabledPaymentAddresses } from './multi-address';
import { deriveAccountDRepPrivateKey, requestAccountKey } from './keys';
import { getNetwork, getStorage } from './storage';


const hasTaggedSets = (cbor) => {
  const tx = Serialization.Transaction.fromCbor(cbor);
  return tx.body().hasTaggedSets();
}

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
  console.log('extractKeyOrScriptHash', address);
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
  const network = address.network_id();
  /** @type {any} */
  const keys = {
    payment: { hash: null, path: null },
    stake: { hash: null, path: null },
  };
  if (hw.device === HW.ledger) {
    const appAda = hw.appAda;
    const networkId = network;
    const paymentIndexByHash = {};
    if (account?.publicKey) {
      for (const row of listEnabledPaymentAddresses(
        Loader.Cardano,
        account,
        networkId
      )) {
        paymentIndexByHash[row.paymentKeyHash] = {
          index: row.index,
          role: row.role ?? ADDRESS_ROLE.external,
        };
      }
    } else {
      paymentIndexByHash[account.paymentKeyHash] = {
        index: 0,
        role: ADDRESS_ROLE.external,
      };
    }
    keyHashes.forEach((keyHash) => {
      if (paymentIndexByHash[keyHash] != null) {
        const { index: addrIdx, role } = paymentIndexByHash[keyHash];
        keys.payment = {
          hash: keyHash,
          path: [
            HARDENED + 1852,
            HARDENED + 1815,
            HARDENED + hw.account,
            role,
            addrIdx,
          ],
        };
      } else if (keyHash === account.stakeKeyHash)
        keys.stake = {
          hash: keyHash,
          path: [HARDENED + 1852, HARDENED + 1815, HARDENED + hw.account, 2, 0],
        };
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
    });
    const ledgerTx = await txToLedger(
      rawTx,
      network,
      keys,
      Buffer.from(address.to_bytes()).toString('hex'),
      hw.account
    );
    const result = await appAda.signTransaction({
      ...ledgerTx,
      options: {
        tagCborSets: hasTaggedSets(tx)
      }
    });
    // getting public keys
    const witnessSet = Loader.Cardano.TransactionWitnessSet.new();
    const vkeys = Loader.Cardano.Vkeywitnesses.new();
    result.witnesses.forEach((witness) => {
      const role = witness.path[3];
      if (role === 0 || role === 1) {
        const addrIdx = witness.path[4] != null ? witness.path[4] : 0;
        const vkey = Loader.Cardano.Bip32PublicKey.from_hex(
          account.publicKey
        )
          .derive(role)
          .derive(addrIdx)
          .to_raw_key();
        const signature = Loader.Cardano.Ed25519Signature.from_hex(
          witness.witnessSignatureHex
        );
        vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
      } else if (
        role == 2 // stake key
      ) {
        const vkey = Loader.Cardano.Bip32PublicKey.from_hex(
          account.publicKey
        )
          .derive(2)
          .derive(0)
          .to_raw_key();
        const signature = Loader.Cardano.Ed25519Signature.from_hex(
          witness.witnessSignatureHex
        );
        vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
      }
    });
    witnessSet.set_vkeys(vkeys);
    return witnessSet;
  }
  if (hw.device === HW.keystone) {
    throw new Error('Keystone signing runs in the Keystone signing tab.');
  }
  if (hw.device === HW.trezor) {
    const paymentIndexByHash = {};
    if (account?.publicKey) {
      for (const row of listEnabledPaymentAddresses(
        Loader.Cardano,
        account,
        network
      )) {
        paymentIndexByHash[row.paymentKeyHash] = {
          index: row.index,
          role: row.role ?? ADDRESS_ROLE.external,
        };
      }
    } else {
      paymentIndexByHash[account.paymentKeyHash] = {
        index: 0,
        role: ADDRESS_ROLE.external,
      };
    }
    keyHashes.forEach((keyHash) => {
      if (paymentIndexByHash[keyHash] != null) {
        const { index: addrIdx, role } = paymentIndexByHash[keyHash];
        keys.payment = {
          hash: keyHash,
          path: `m/1852'/1815'/${hw.account}'/${role}/${addrIdx}`,
        };
      } else if (keyHash === account.stakeKeyHash)
        keys.stake = {
          hash: keyHash,
          path: `m/1852'/1815'/${hw.account}'/2/0`,
        };
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
    });
    const trezorTx = await txToTrezor(
      rawTx,
      network,
      keys,
      Buffer.from(address.to_bytes()).toString('hex'),
      hw.account
    );
    const result = await TrezorConnect.cardanoSignTransaction({
      ...trezorTx,
      tagCborSets: hasTaggedSets(tx),
    });
    if (!result.success) throw new Error('Trezor could not sign tx');
    const witnessSet = Loader.Cardano.TransactionWitnessSet.new();
    const vkeys = Loader.Cardano.Vkeywitnesses.new();
    result.payload.witnesses.forEach((witness) => {
      const vkey = Loader.Cardano.PublicKey.from_bytes(
        Buffer.from(witness.pubKey, 'hex')
      );
      const signature = Loader.Cardano.Ed25519Signature.from_hex(
        witness.signature
      );
      vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
    });
    witnessSet.set_vkeys(vkeys);
    return witnessSet;
  }
  throw new Error('Unsupported hardware wallet device');
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
      return await result.json();
    }
    throw APIError.InvalidRequest;
  }
  
  try {
    const result = await koiosSubmitTransaction(txHex);
    invalidateReadCache();
    return result;
  } catch (/** @type {any} */ error) {
    console.error('Koios transaction submission error:', error);
    throw new Error(`Transaction submission failed: ${error.message}`);
  }
};

