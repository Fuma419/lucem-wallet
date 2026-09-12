/**
 * Proof that an imported Ledger account really belongs to the connected
 * device.
 *
 * `getExtendedPublicKeys` returns raw bytes. Over Bluetooth a stale notify
 * subscription can deliver a frame from the previous exchange, and 64
 * arbitrary bytes still parse as a `Bip32PublicKey` — Lucem then stored a
 * phantom account whose address the owner had never seen. So every import
 * asks the device to derive the same account's address and compares it with
 * the address computed locally from the exported key.
 */

import { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';
import { HW } from '../../config/config';
import Loader from '../loader';

/** CIP-1852 Cardano: m/1852'/1815'/account'. */
export const CARDANO_PURPOSE = 1852;
export const CARDANO_COIN_TYPE = 1815;

/** `AddressType.BASE_PAYMENT_KEY_STAKE_KEY` — avoids importing the enum. */
export const LEDGER_BASE_ADDRESS_TYPE = 0;

/**
 * Verification always runs against mainnet params: the answer only has to be
 * reproducible, and Lucem's active network must not change whether an import
 * is trusted.
 */
export const LEDGER_VERIFY_NETWORK = {
  protocolMagic: 764824073,
  networkId: 1,
};

/** An extended public key is 32 bytes of key plus 32 of chain code. */
export const EXTENDED_PUBLIC_KEY_HEX_LENGTH = 128;

export const LEDGER_KEY_MISMATCH_MESSAGE =
  'The Ledger reported an address that does not match the key it exported, so Lucem did not import the account. Unplug or power-cycle the Ledger, open the Cardano app, and connect again. Nothing was saved.';

export const LEDGER_KEY_MALFORMED_MESSAGE =
  'The Ledger returned an unreadable account key, so Lucem did not import the account. Unplug or power-cycle the Ledger, open the Cardano app, and connect again. Nothing was saved.';

/**
 * A 25th-word passphrase derives a whole separate wallet from the same seed,
 * so one device can legitimately own several accounts in the same CIP-1852
 * slot. The stored index carries a fingerprint of the account key to tell
 * them apart — device id plus slot number is not unique.
 */
export const LEDGER_KEY_FINGERPRINT_LENGTH = 8;

/** @param {number|string} accountIndex */
export const ledgerAccountPath = (accountIndex) => [
  HARDENED + CARDANO_PURPOSE,
  HARDENED + CARDANO_COIN_TYPE,
  HARDENED + parseInt(String(accountIndex), 10),
];

/**
 * `deriveAddress` / `showAddress` params for an account's first address.
 * Same derivation `createHWAccounts` uses when it stores `paymentAddr`.
 * @param {number|string} accountIndex
 */
export const ledgerBaseAddressParams = (accountIndex) => {
  const account = ledgerAccountPath(accountIndex);
  return {
    type: LEDGER_BASE_ADDRESS_TYPE,
    params: {
      spendingPath: [...account, 0, 0],
      stakingPath: [...account, 2, 0],
    },
  };
};

/** @param {string} hex */
export const isExtendedPublicKeyHex = (hex) =>
  typeof hex === 'string' &&
  hex.length === EXTENDED_PUBLIC_KEY_HEX_LENGTH &&
  /^[0-9a-f]+$/i.test(hex);

/**
 * Mainnet base address bytes for an exported account key, as lowercase hex.
 * Caller must have awaited `Loader.load()`.
 * @param {string} extendedPublicKeyHex
 */
export const baseAddressHexFromAccountKey = (extendedPublicKeyHex) => {
  if (!isExtendedPublicKeyHex(extendedPublicKeyHex)) {
    throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  }
  // CSL rejects a non-curve key from `derive`, sometimes by throwing a bare
  // wasm value rather than an Error, so guard the whole derivation.
  try {
    const accountKey = Loader.Cardano.Bip32PublicKey.from_hex(
      extendedPublicKeyHex
    );
    const paymentHash = accountKey.derive(0).derive(0).to_raw_key().hash();
    const stakeHash = accountKey.derive(2).derive(0).to_raw_key().hash();
    const address = Loader.Cardano.BaseAddress.new(
      LEDGER_VERIFY_NETWORK.networkId,
      Loader.Cardano.Credential.from_keyhash(paymentHash),
      Loader.Cardano.Credential.from_keyhash(stakeHash)
    ).to_address();
    return Buffer.from(address.to_bytes()).toString('hex').toLowerCase();
  } catch (/** @type {any} */ _) {
    throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  }
};

/**
 * Short, stable id for the wallet an account key belongs to. Caller must have
 * awaited `Loader.load()`.
 * @param {string} extendedPublicKeyHex
 */
export const ledgerKeyFingerprint = (extendedPublicKeyHex) => {
  if (!isExtendedPublicKeyHex(extendedPublicKeyHex)) {
    throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  }
  try {
    return Loader.Cardano.Bip32PublicKey.from_hex(extendedPublicKeyHex)
      .to_raw_key()
      .hash()
      .to_hex()
      .slice(0, LEDGER_KEY_FINGERPRINT_LENGTH)
      .toLowerCase();
  } catch (/** @type {any} */ _) {
    throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  }
};

/**
 * Storage key for an imported Ledger account:
 * `ledger-<device id hex>-<slot>-k<key fingerprint>`.
 * @param {{ idHex: string, account: number|string, fingerprint: string }} args
 */
export const ledgerAccountStorageIndex = ({ idHex, account, fingerprint }) =>
  `${HW.ledger}-${idHex}-${parseInt(String(account), 10)}-k${fingerprint}`;

/**
 * Names for accounts about to be imported. The same slot on the same device
 * can hold more than one wallet, so a second one is marked as a passphrase
 * wallet rather than colliding with `Ledger 1`.
 *
 * @param {{
 *   existing?: Array<{ account: number, publicKey?: string, name?: string }>,
 *   verified?: Array<{ accountIndex: string, publicKey: string }>,
 * }} args
 * @returns {string[]}
 */
export const ledgerImportNames = ({ existing = [], verified = [] }) => {
  const taken = new Set(existing.map((row) => row && row.name).filter(Boolean));
  return verified.map(({ accountIndex, publicKey }) => {
    const slot = parseInt(String(accountIndex), 10);
    const base = `Ledger ${slot + 1}`;
    const key = String(publicKey || '').toLowerCase();
    const isSeparateWallet = existing.some(
      (row) =>
        row &&
        row.account === slot &&
        String(row.publicKey || '').toLowerCase() !== key
    );
    if (!isSeparateWallet) return base;
    let name = `${base} (passphrase)`;
    for (let n = 2; taken.has(name); n += 1) {
      name = `${base} (passphrase ${n})`;
    }
    taken.add(name);
    return name;
  });
};

export const LEDGER_WRONG_WALLET_MESSAGE =
  'This Ledger is not the wallet this account came from. If the account uses a 25th-word passphrase, unlock the device with that passphrase and try again.';

/**
 * Refuse to sign with a device that no longer holds the account's key — the
 * usual cause is a passphrase wallet that is not the one now unlocked.
 * @param {{ appAda: any, account: number|string, expectedPublicKeyHex: string }} args
 */
export const assertLedgerAccountMatches = async ({
  appAda,
  account,
  expectedPublicKeyHex,
}) => {
  const keys = await appAda.getExtendedPublicKeys({
    paths: [ledgerAccountPath(account)],
  });
  const found = Array.isArray(keys) ? keys[0] : null;
  if (!found) throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  const got = `${found.publicKeyHex || ''}${found.chainCodeHex || ''}`;
  if (
    !isExtendedPublicKeyHex(got) ||
    got.toLowerCase() !== String(expectedPublicKeyHex || '').toLowerCase()
  ) {
    throw new Error(LEDGER_WRONG_WALLET_MESSAGE);
  }
};

/**
 * Throw unless the device's own address for `accountIndex` matches the key it
 * exported for that account.
 * @param {{ extendedPublicKeyHex: string, deviceAddressHex: string }} args
 */
export const assertLedgerKeyMatchesDevice = ({
  extendedPublicKeyHex,
  deviceAddressHex,
}) => {
  const expected = baseAddressHexFromAccountKey(extendedPublicKeyHex);
  const reported = String(deviceAddressHex || '').toLowerCase();
  if (!reported || reported !== expected) {
    throw new Error(LEDGER_KEY_MISMATCH_MESSAGE);
  }
  return expected;
};

/**
 * Fetch each selected account's key and prove it against the device.
 * `showFirstAddress` makes the device display the first account's address so
 * the owner approves what is being imported.
 *
 * @param {{
 *   appAda: any,
 *   accountIndexes: Array<string|number>,
 *   showFirstAddress?: boolean,
 * }} args
 * @returns {Promise<Array<{ accountIndex: string, publicKey: string, keyFingerprint: string }>>}
 */
export const exportVerifiedLedgerAccounts = async ({
  appAda,
  accountIndexes,
  showFirstAddress = true,
}) => {
  await Loader.load();
  const indexes = (accountIndexes || []).map((i) => String(i));
  if (indexes.length < 1) throw new Error('No accounts selected');

  const keys = await appAda.getExtendedPublicKeys({
    paths: indexes.map((index) => ledgerAccountPath(index)),
  });
  if (!Array.isArray(keys) || keys.length !== indexes.length) {
    throw new Error(LEDGER_KEY_MALFORMED_MESSAGE);
  }

  const verified = [];
  for (let i = 0; i < indexes.length; i += 1) {
    const { publicKeyHex, chainCodeHex } = keys[i] || {};
    const publicKey = `${publicKeyHex || ''}${chainCodeHex || ''}`;
    const address = ledgerBaseAddressParams(indexes[i]);
    const derived = await appAda.deriveAddress({
      network: LEDGER_VERIFY_NETWORK,
      address,
    });
    assertLedgerKeyMatchesDevice({
      extendedPublicKeyHex: publicKey,
      deviceAddressHex: derived && derived.addressHex,
    });
    if (i === 0 && showFirstAddress) {
      await appAda.showAddress({ network: LEDGER_VERIFY_NETWORK, address });
    }
    verified.push({
      accountIndex: indexes[i],
      publicKey,
      keyFingerprint: ledgerKeyFingerprint(publicKey),
    });
  }
  return verified;
};
