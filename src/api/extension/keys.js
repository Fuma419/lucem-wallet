/**
 * Root-key encrypt/decrypt, CIP-1852 derivation, and password change.
 * Depends only on ./storage (no signing or chain-read imports).
 */
import cryptoRandomString from 'crypto-random-string';
import { ERROR, STORAGE } from '../../config/config';
import Loader from '../loader';
import { getStorage, setStorage } from './storage';


export const encryptWithPassword = async (password, rootKeyBytes) => {
  await Loader.load();
  const rootKeyHex = rootKeyBytes instanceof Uint8Array
    ? Buffer.from(rootKeyBytes).toString('hex')
    : Buffer.from(rootKeyBytes, 'hex').toString('hex');
  const passwordHex = Buffer.from(password).toString('hex');
  const salt = cryptoRandomString({ length: 2 * 32 });
  const nonce = cryptoRandomString({ length: 2 * 12 });
  return Loader.Cardano.encrypt_with_password(
    passwordHex,
    salt,
    nonce,
    rootKeyHex
  );
};

export const decryptWithPassword = async (password, encryptedKeyHex) => {
  await Loader.load();
  const passwordHex = Buffer.from(password).toString('hex');
  let decryptedHex;
  try {
    decryptedHex = Loader.Cardano.decrypt_with_password(
      passwordHex,
      encryptedKeyHex
    );
  } catch (err) {
    throw new Error(ERROR.wrongPassword);
  }
  return decryptedHex;
};

export const harden = (num) => {
  return 0x80000000 + num;
};

export const deriveAccountDRepPrivateKey = (accountKey) =>
  accountKey.derive(3).derive(0).to_raw_key();

export const deriveAccountStakePublicKeyHex = (accountPublicKeyHex) => {
  const stakeKey = Loader.Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex)
    .derive(2)
    .derive(0)
    .to_raw_key();
  return Buffer.from(stakeKey.as_bytes()).toString('hex');
};

export const deriveAccountDRepPublicKeyHex = (accountPublicKeyHex) => {
  const drepKey = Loader.Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex)
    .derive(3)
    .derive(0)
    .to_raw_key();
  return Buffer.from(drepKey.as_bytes()).toString('hex');
};

const resolveEncryptedRootKey = async (walletId) => {
  const id = walletId == null || walletId === '' ? '0' : String(walletId);
  const map = await getStorage(STORAGE.encryptedKeys);
  if (map && typeof map === 'object' && map[id]) return map[id];
  if (id === '0') {
    const legacy = await getStorage(STORAGE.encryptedKey);
    if (legacy) return legacy;
  }
  throw new Error(`No stored key for wallet ${id}`);
};

export const requestAccountKey = async (password, accountIndex, walletId = null) => {
  await Loader.load();
  const encryptedRootKey = await resolveEncryptedRootKey(walletId);
  let accountKey;
  let decryptedHex;
  try {
    decryptedHex = await decryptWithPassword(password, encryptedRootKey);
  } catch (e) {
    throw ERROR.wrongPassword;
  }
  try {
    accountKey = Loader.Cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(decryptedHex, 'hex')
    )
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type
      .derive(harden(parseInt(accountIndex)));
  } catch (e) {
    console.error('Key derivation failed after successful decryption:', e);
    throw ERROR.wrongPassword;
  }

  return {
    accountKey,
    paymentKey: accountKey.derive(0).derive(0).to_raw_key(),
    stakeKey: accountKey.derive(2).derive(0).to_raw_key(),
  };
};

/**
 * Re-encrypt every seed in the vault (legacy `encryptedKey` + all `encryptedKeys`)
 * under a new password. Throws `ERROR.wrongPassword` if `currentPassword` is wrong.
 */
export const changeWalletPassword = async (currentPassword, newPassword) => {
  await Loader.load();

  const reencrypt = async (encryptedHex) => {
    let decryptedHex;
    try {
      decryptedHex = await decryptWithPassword(currentPassword, encryptedHex);
    } catch (e) {
      throw ERROR.wrongPassword;
    }
    let rootKey = Loader.Cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(decryptedHex, 'hex')
    );
    const out = await encryptWithPassword(newPassword, rootKey.as_bytes());
    rootKey.free();
    rootKey = null;
    return out;
  };

  const legacy = await getStorage(STORAGE.encryptedKey);
  const map = await getStorage(STORAGE.encryptedKeys);

  const patch = {};
  if (legacy) patch[STORAGE.encryptedKey] = await reencrypt(legacy);
  if (map && typeof map === 'object' && Object.keys(map).length > 0) {
    const nextMap = {};
    for (const id of Object.keys(map)) {
      nextMap[id] = await reencrypt(map[id]);
    }
    patch[STORAGE.encryptedKeys] = nextMap;
  }
  await setStorage(patch);
  return true;
};

