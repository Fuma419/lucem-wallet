/**
 * CIP-1852 external (receive) address helpers.
 *
 * Lucem historically tracked only role=0 / index=0 per account. Advanced
 * multi-address mode lets the user enable additional external indices so
 * balances, UTxOs, and signing include those addresses.
 *
 * Paths: m/1852'/1815'/account'/0/index  (external)
 * Stake remains role 2 / index 0 for base addresses.
 */

/** Max external index users can enable (index 0 .. MAX inclusive). */
export const MAX_EXTERNAL_ADDRESS_INDEX = 20;

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

/** True when more than the primary external address is enabled. */
export const isMultiAddressEnabled = (account) =>
  getExternalIndices(account).length > 1;

/**
 * Normalize a proposed index list: unique, sorted, always includes 0, capped.
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
 * Derive payment key hash + base address for external index `addressIndex`
 * from an account-level BIP32 public key.
 *
 * @param {object} Cardano - CSL module
 * @param {string} accountPublicKeyHex
 * @param {number} networkId - Shelley network id (1 mainnet, 0 testnet)
 * @param {number} addressIndex - CIP-1852 external chain index
 */
export const deriveExternalPaymentFromAccountPublicKey = (
  Cardano,
  accountPublicKeyHex,
  networkId,
  addressIndex = 0
) => {
  const accountPub = Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex);
  const paymentKeyHashRaw = accountPub
    .derive(0)
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
    index: addressIndex,
    paymentAddr,
    paymentKeyHash,
    paymentKeyHashBech32,
  };
};

/**
 * Build the list of enabled payment addresses for an account on a network.
 * Uses cached `paymentAddr` / `paymentKeyHash` for index 0 when present.
 */
export const listEnabledPaymentAddresses = (
  Cardano,
  account,
  networkIdNumber
) => {
  const indices = getExternalIndices(account);
  const out = [];
  for (const index of indices) {
    if (
      index === 0 &&
      account?.paymentAddr &&
      account?.paymentKeyHash
    ) {
      out.push({
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
      deriveExternalPaymentFromAccountPublicKey(
        Cardano,
        account.publicKey,
        networkIdNumber,
        index
      )
    );
  }
  return out;
};
