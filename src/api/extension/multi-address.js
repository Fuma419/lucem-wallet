/**
 * CIP-1852 payment address helpers.
 *
 * All accounts are multi-address: external (role=0) indices beyond 0 may be
 * user-activated, and import/balance refresh discover internal/change (role=1)
 * indices so ADA left on change addresses is included in balance, UTxOs, and
 * signing. There is no per-account multi-address toggle.
 *
 * Paths: m/1852'/1815'/account'/role/index
 *   role 0 = external (receive)
 *   role 1 = internal (change)
 * Stake remains role 2 / index 0 for base addresses.
 *
 * Accounts UI listing is narrower than the enabled/signing set: show addresses
 * that currently hold assets, plus external indices the user explicitly
 * activated (`userExternalIndices`). Discovery still activates for balance /
 * spend without cluttering an empty-address list.
 */
import { bigIntLovelace } from '../lovelace-scalar';

/** Max external/internal index users can enable (index 0 .. MAX inclusive). */
export const MAX_EXTERNAL_ADDRESS_INDEX = 50;
export const MAX_INTERNAL_ADDRESS_INDEX = 50;

/** CIP-1852 chain roles. */
export const ADDRESS_ROLE = {
  external: 0,
  internal: 1,
  stake: 2,
  drep: 3,
};

/**
 * BIP-32 path for a CIP-1852 payment key (external or change).
 * @param {number} accountIndex - CIP-1852 account'
 * @param {number} role - 0 external / 1 internal
 * @param {number} addressIndex
 */
export const cip1852PaymentPath = (accountIndex, role, addressIndex) =>
  `m/1852'/1815'/${accountIndex}'/${role}/${addressIndex}`;

/**
 * Enabled external indices for an account. Always includes 0. Missing/legacy
 * accounts default to `[0]` (single-address mode).
 */
export const getExternalIndices = (account) => {
  const raw = account?.externalIndices;
  const parsed = Array.isArray(raw)
    ? raw
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_EXTERNAL_ADDRESS_INDEX)
    : [];
  const set = new Set([0, ...parsed]);
  return Array.from(set).sort((a, b) => a - b);
};

/**
 * Enabled internal (change) indices. Default `[]` — none until discovered or set.
 */
export const getInternalIndices = (account) => {
  const raw = account?.internalIndices;
  if (!Array.isArray(raw)) return [];
  const set = new Set();
  for (const n of raw) {
    const i = parseInt(n, 10);
    if (Number.isFinite(i) && i >= 0 && i <= MAX_INTERNAL_ADDRESS_INDEX) {
      set.add(i);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
};

/** True when more than the primary external address is enabled. */
export const isMultiAddressEnabled = (account) =>
  getExternalIndices(account).length > 1 || getInternalIndices(account).length > 0;

/**
 * External indices the user explicitly activated (Add address / Remove).
 * Always includes 0. Distinct from discovery-populated `externalIndices`.
 *
 * Legacy accounts without the field fall back to `externalIndices` until
 * discovery snapshots `userExternalIndices`.
 */
export const getUserExternalIndices = (account) => {
  const raw = account?.userExternalIndices;
  if (Array.isArray(raw)) {
    return normalizeExternalIndices(raw);
  }
  return getExternalIndices(account);
};

/** True when an address-details row holds ADA or native assets. */
export const paymentAddressHasAssets = (row) => {
  try {
    if (bigIntLovelace(row?.lovelace) > 0n) return true;
  } catch (/** @type {any} */ _) {
    /* ignore malformed lovelace */
  }
  return (row?.nativeAssetCount ?? 0) > 0;
};

/**
 * Accounts-screen address list: funded addresses + user-activated externals.
 * Does not affect which addresses are enabled for balance/signing.
 */
export const filterPaymentAddressesForAccountsDisplay = (rows, account) => {
  const userExt = new Set(getUserExternalIndices(account));
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (paymentAddressHasAssets(row)) return true;
    const role = row?.role ?? ADDRESS_ROLE.external;
    if (row?.index == null || row.index === '') return false;
    return role === ADDRESS_ROLE.external && userExt.has(row.index);
  });
};

/**
 * Normalize a proposed external index list: unique, sorted, always includes 0, capped.
 */
export const normalizeExternalIndices = (indices) => {
  const set = new Set([0]);
  if (Array.isArray(indices)) {
    for (const n of indices) {
      const i = parseInt(n, 10);
      if (Number.isFinite(i) && i >= 0 && i <= MAX_EXTERNAL_ADDRESS_INDEX) {
        set.add(i);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
};

/**
 * Normalize internal indices: unique, sorted, capped (0 not required).
 */
export const normalizeInternalIndices = (indices) => {
  const set = new Set();
  if (Array.isArray(indices)) {
    for (const n of indices) {
      const i = parseInt(n, 10);
      if (Number.isFinite(i) && i >= 0 && i <= MAX_INTERNAL_ADDRESS_INDEX) {
        set.add(i);
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b);
};

/**
 * Derive payment key hash + base address for CIP-1852 role/index from an
 * account-level BIP32 public key.
 *
 * @param {*} Cardano - CSL module
 * @param {string} accountPublicKeyHex
 * @param {number} networkId - Shelley network id (1 mainnet, 0 testnet)
 * @param {number} role - 0 external, 1 internal
 * @param {number} addressIndex
 */
export const derivePaymentFromAccountPublicKey = (
  Cardano,
  accountPublicKeyHex,
  networkId,
  role = ADDRESS_ROLE.external,
  addressIndex = 0
) => {
  const accountPub = Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex);
  const paymentKeyHashRaw = accountPub
    .derive(role)
    .derive(addressIndex)
    .to_raw_key()
    .hash();
  const stakeKeyHashRaw = accountPub.derive(2).derive(0).to_raw_key().hash();

  const paymentKeyHash = Buffer.from(paymentKeyHashRaw.to_bytes()).toString(
    'hex'
  );
  const paymentKeyHashBech32 = paymentKeyHashRaw.to_bech32('addr_vkh');
  const paymentAddr = Cardano.BaseAddress.new(
    networkId,
    Cardano.Credential.from_keyhash(paymentKeyHashRaw),
    Cardano.Credential.from_keyhash(stakeKeyHashRaw)
  )
    .to_address()
    .to_bech32();

  return {
    role,
    index: addressIndex,
    paymentAddr,
    paymentKeyHash,
    paymentKeyHashBech32,
  };
};

/**
 * Derive payment key hash + base address for external index `addressIndex`.
 * @deprecated Prefer derivePaymentFromAccountPublicKey with role 0.
 */
export const deriveExternalPaymentFromAccountPublicKey = (
  Cardano,
  accountPublicKeyHex,
  networkId,
  addressIndex = 0
) => {
  const row = derivePaymentFromAccountPublicKey(
    Cardano,
    accountPublicKeyHex,
    networkId,
    ADDRESS_ROLE.external,
    addressIndex
  );
  // Preserve legacy shape (no role field required by older callers).
  return {
    index: row.index,
    paymentAddr: row.paymentAddr,
    paymentKeyHash: row.paymentKeyHash,
    paymentKeyHashBech32: row.paymentKeyHashBech32,
  };
};

/**
 * Map on-chain payment addresses to CIP-1852 indices for a given role.
 *
 * @param {number} role - 0 external / 1 internal
 * @param {{ alwaysIncludeZero?: boolean }} [opts]
 * @returns {number[]} sorted unique indices
 */
export const matchRoleIndicesFromAddresses = (
  Cardano,
  accountPublicKeyHex,
  networkIdNumber,
  addresses,
  role,
  maxIndex = role === ADDRESS_ROLE.internal
    ? MAX_INTERNAL_ADDRESS_INDEX
    : MAX_EXTERNAL_ADDRESS_INDEX,
  opts = {}
) => {
  const alwaysIncludeZero = opts.alwaysIncludeZero ?? role === ADDRESS_ROLE.external;
  const wanted = new Set(
    (Array.isArray(addresses) ? addresses : [])
      .map((a) => (typeof a === 'string' ? a : a?.address))
      .filter((a) => typeof a === 'string' && a.length > 0)
  );
  const found = new Set(alwaysIncludeZero ? [0] : []);
  if (!accountPublicKeyHex || wanted.size === 0) {
    return Array.from(found).sort((a, b) => a - b);
  }
  for (let i = 0; i <= maxIndex; i++) {
    const { paymentAddr } = derivePaymentFromAccountPublicKey(
      Cardano,
      accountPublicKeyHex,
      networkIdNumber,
      role,
      i
    );
    if (wanted.has(paymentAddr)) {
      found.add(i);
    }
  }
  return Array.from(found).sort((a, b) => a - b);
};

/**
 * Map on-chain payment addresses to CIP-1852 external indices (0..max inclusive).
 * Always includes 0.
 */
export const matchExternalIndicesFromAddresses = (
  Cardano,
  accountPublicKeyHex,
  networkIdNumber,
  addresses,
  maxIndex = MAX_EXTERNAL_ADDRESS_INDEX
) =>
  matchRoleIndicesFromAddresses(
    Cardano,
    accountPublicKeyHex,
    networkIdNumber,
    addresses,
    ADDRESS_ROLE.external,
    maxIndex,
    { alwaysIncludeZero: true }
  );

/**
 * Map on-chain payment addresses to CIP-1852 internal (change) indices.
 */
export const matchInternalIndicesFromAddresses = (
  Cardano,
  accountPublicKeyHex,
  networkIdNumber,
  addresses,
  maxIndex = MAX_INTERNAL_ADDRESS_INDEX
) =>
  matchRoleIndicesFromAddresses(
    Cardano,
    accountPublicKeyHex,
    networkIdNumber,
    addresses,
    ADDRESS_ROLE.internal,
    maxIndex,
    { alwaysIncludeZero: false }
  );

/**
 * Flatten Koios `/account_addresses` payload into a list of payment addresses.
 */
export const flattenAccountAddressesPayload = (payload) => {
  if (!Array.isArray(payload)) return [];
  const out = [];
  for (const row of payload) {
    if (typeof row === 'string') {
      out.push(row);
      continue;
    }
    if (typeof row?.address === 'string') {
      out.push(row.address);
      continue;
    }
    if (Array.isArray(row?.addresses)) {
      for (const a of row.addresses) {
        if (typeof a === 'string') out.push(a);
        else if (typeof a?.address === 'string') out.push(a.address);
      }
    }
  }
  return out;
};

/**
 * Build the list of enabled payment addresses for an account on a network
 * (external + discovered/enabled internal change addresses).
 * Uses cached `paymentAddr` / `paymentKeyHash` for external index 0 when present.
 */
export const listEnabledPaymentAddresses = (
  Cardano,
  account,
  networkIdNumber
) => {
  const out = [];
  const externalIndices = getExternalIndices(account);
  for (const index of externalIndices) {
    if (
      index === 0 &&
      account?.paymentAddr &&
      account?.paymentKeyHash
    ) {
      out.push({
        role: ADDRESS_ROLE.external,
        index: 0,
        paymentAddr: account.paymentAddr,
        paymentKeyHash: account.paymentKeyHash,
        paymentKeyHashBech32: account.paymentKeyHashBech32 || null,
      });
      continue;
    }
    if (!account?.publicKey) {
      continue;
    }
    out.push(
      derivePaymentFromAccountPublicKey(
        Cardano,
        account.publicKey,
        networkIdNumber,
        ADDRESS_ROLE.external,
        index
      )
    );
  }

  if (!account?.publicKey) {
    return out;
  }

  for (const index of getInternalIndices(account)) {
    out.push(
      derivePaymentFromAccountPublicKey(
        Cardano,
        account.publicKey,
        networkIdNumber,
        ADDRESS_ROLE.internal,
        index
      )
    );
  }
  return out;
};

/**
 * Look up an enabled payment/change address row by bech32.
 * Used when assigning HD paths to tx inputs (Keystone / HW).
 *
 * @returns {{ role: number, index: number|null, paymentAddr: string, paymentKeyHash: string } | null}
 */
export const findEnabledPaymentByAddress = (
  Cardano,
  account,
  networkIdNumber,
  bech32
) => {
  if (!bech32) return null;
  const rows = listEnabledPaymentAddresses(Cardano, account, networkIdNumber);
  const enabled = rows.find((r) => r.paymentAddr === bech32);
  if (enabled) return enabled;
  if (!account?.publicKey) return null;
  for (const role of [ADDRESS_ROLE.external, ADDRESS_ROLE.internal]) {
    const max =
      role === ADDRESS_ROLE.internal
        ? MAX_INTERNAL_ADDRESS_INDEX
        : MAX_EXTERNAL_ADDRESS_INDEX;
    for (let index = 0; index <= max; index += 1) {
      const row = derivePaymentFromAccountPublicKey(
        Cardano,
        account.publicKey,
        networkIdNumber,
        role,
        index
      );
      if (row.paymentAddr === bech32) return row;
    }
  }
  return null;
};
