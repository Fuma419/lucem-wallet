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
 * @returns {Promise<Array<{ accountIndex: string, publicKey: string }>>}
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
    verified.push({ accountIndex: indexes[i], publicKey });
  }
  return verified;
};
