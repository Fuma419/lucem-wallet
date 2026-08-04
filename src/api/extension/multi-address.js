/**
 * CIP-1852 payment address helpers.
 *
 * Lucem historically tracked only role=0 / index=0 per account. Advanced
 * multi-address mode enables additional external (role=0) indices. Import and
 * balance refresh also discover internal/change (role=1) indices so ADA left
 * on change addresses (common after spending from other wallets) is included
 * in balance, UTxOs, and signing.
 *
 * Paths: m/1852'/1815'/account'/role/index
 *   role 0 = external (receive)
 *   role 1 = internal (change)
 * Stake remains role 2 / index 0 for base addresses.
 */

/** Max external/internal index users can enable (index 0 .. MAX inclusive). */
export const MAX_EXTERNAL_ADDRESS_INDEX = 20;
export const MAX_INTERNAL_ADDRESS_INDEX = 20;

/** CIP-1852 chain roles. */
export const ADDRESS_ROLE = {
  external: 0,
  internal: 1,
};

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
 * @param {object} Cardano - CSL module
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
