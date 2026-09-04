/**
 * Keystone air-gapped helpers (Cardano CIP-1852) using @keystonehq/keystone-sdk.
 */

import KeystoneSDK, {
  UR,
  URType,
  AccountNote,
  Curve,
  DerivationAlgorithm,
  QRHardwareCallVersion,
} from '@keystonehq/keystone-sdk';
import {
  CryptoKeypath,
  PathComponent,
} from '@keystonehq/bc-ur-registry-cardano';
import {
  cip1852PaymentPath,
  findEnabledPaymentByAddress,
  listEnabledPaymentAddresses,
} from './extension/multi-address';
import Loader from './loader';

/**
 * Transaction input index: CSL v15 returns a plain number; older bindings used BigNum with to_str().
 * @param {*} input
 */
function transactionInputIndex(input) {
  const idx = input.index();
  if (typeof idx === 'number' && Number.isFinite(idx)) return idx;
  if (idx != null && typeof idx.to_str === 'function') {
    return parseInt(idx.to_str(), 10);
  }
  return parseInt(String(idx), 10);
}

/**
 * CIP-1852 account node or deeper (payment/stake leaf). Keystone may report either
 * depending on firmware / export mode; the account index is always the third step.
 */
const CIP1852_ACCOUNT_STEP_RE =
  /^m\/1852'\/1815'\/(\d+)'(?:\/\d+\/\d+)?$/i;

/** @typedef {'standard' | 'ledger'} KeystoneDerivationProfile */

/** @type {{ readonly standard: 'standard', readonly ledger: 'ledger' }} */
export const KEYSTONE_DERIVATION = {
  standard: 'standard',
  ledger: 'ledger',
};

/**
 * Sparse, slow frames so a Keystone camera can lock onto the UR.
 * @keystonehq/animated-qr defaults are 400 / 100ms. Larger fragments + faster
 * cycling made sign and connect QRs unreadable on-device.
 */
export const KEYSTONE_ANIMATED_QR_OPTIONS = Object.freeze({
  size: 280,
  capacity: 200,
  interval: 250,
});

/** Sign and connect share the same scannable settings. */
export const KEYSTONE_SIGN_ANIMATED_QR_OPTIONS = KEYSTONE_ANIMATED_QR_OPTIONS;

/**
 * Fall back to a compact CardanoSignTxHashRequest at/above this unsigned-tx
 * size. Matches the Keystone SDK's own `sizeLimit.ada` default, i.e. the
 * vendor's view of the largest payload the device will take as a full
 * transaction.
 *
 * Keep this as high as the vendor allows. A hash request carries no
 * transaction body, so the device cannot show what it is signing (firmware
 * warns that the data is not readable) and the returned signature does not
 * always come back as a witness set we can attach. A 20-input send is only
 * ~870 bytes, so a lower bound silently pushed everyday sends onto that blind
 * path. We still build the hash UR ourselves: the SDK would hash the full
 * Transaction CBOR, which is not the Cardano tx id (blake2b-256 of the body).
 */
const KEYSTONE_ADA_MAX_FULL_TX_BYTES = 2048;

/** True when the unsigned tx is too large to send as a readable full tx. */
export function keystoneNeedsTxHashRequest(signDataLength) {
  return Number(signDataLength) >= KEYSTONE_ADA_MAX_FULL_TX_BYTES;
}

const LEDGER_DERIVATION_HINT =
  /ledger|bit\s*box|bitbox|lbx2|\blbx\b|ledger_live|ledger_legacy/i;
/** Avoid matching generic “Cardano” in wallet names — that falsely implied standard. */
const STANDARD_DERIVATION_HINT =
  /\bicarus\b|\byoroi\b|\bdaedalus\b|\beternl\b|\btyphon\b|\bnami\b|account\.standard\b|\bcardano\s*native\b/i;

export function normalizeKeystonePath(path) {
  if (!path || typeof path !== 'string') return '';
  return path.trim().replace(/^M\//, 'm/');
}

/** @returns {string} */
function keystoneTextField(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'object' && typeof value.toString === 'function') {
    try {
      return String(value.toString('utf8'));
    } catch (/** @type {any} */ _) {
      return String(value);
    }
  }
  return String(value);
}

/** @returns {number | null} CIP-1852 account index, or null if not a supported path */
export function parseCip1852AccountIndexFromPath(path) {
  const p = normalizeKeystonePath(path);
  const m = p.match(CIP1852_ACCOUNT_STEP_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Account-node only (`m/1852'/1815'/N'`). Payment/stake leaves must not be stored as xpubs. */
export function isCip1852AccountNodePath(path) {
  return /^m\/1852'\/1815'\/\d+'$/i.test(normalizeKeystonePath(path));
}

/**
 * Infer Ledger-compatible vs Cardano-standard export from Keystone UR metadata.
 * Firmware uses {@link AccountNote} strings on `note` (e.g. `account.ledger_live`).
 */
/**
 * Same as {@link inferKeystoneDerivationProfile} but returns `null` when the UR
 * does not indicate Ledger vs Cardano-standard (so the UI choice can apply).
 */
export function inferKeystoneDerivationProfileOrNull(note, name) {
  const rawNote = keystoneTextField(note).trim();
  const rawName = keystoneTextField(name).trim();
  const text = `${rawNote} ${rawName}`.trim();

  if (
    rawNote === AccountNote.LedgerLive ||
    rawNote === AccountNote.LedgerLegacy
  ) {
    return KEYSTONE_DERIVATION.ledger;
  }
  if (rawNote === AccountNote.Standard) {
    return KEYSTONE_DERIVATION.standard;
  }

  if (/account\.ledger(?:_live|_legacy)?\b/i.test(text)) {
    return KEYSTONE_DERIVATION.ledger;
  }
  if (/account\.standard\b/i.test(text)) {
    return KEYSTONE_DERIVATION.standard;
  }

  if (LEDGER_DERIVATION_HINT.test(text)) {
    return KEYSTONE_DERIVATION.ledger;
  }
  if (STANDARD_DERIVATION_HINT.test(text)) {
    return KEYSTONE_DERIVATION.standard;
  }
  return null;
}

export function inferKeystoneDerivationProfile(note, name) {
  return (
    inferKeystoneDerivationProfileOrNull(note, name) ?? KEYSTONE_DERIVATION.standard
  );
}

/**
 * Stored profile for one connect-UR row. Device metadata is the only source
 * when present. A Lucem fallback is used only for unlabeled rows.
 * @param {KeystoneDerivationProfile | null | undefined} inferred
 * @param {KeystoneDerivationProfile | null | undefined} fallbackProfile
 * @returns {KeystoneDerivationProfile}
 */
export function resolveKeystoneConnectProfile(inferred, fallbackProfile) {
  if (inferred === KEYSTONE_DERIVATION.ledger) {
    return 'ledger';
  }
  if (inferred === KEYSTONE_DERIVATION.standard) {
    return 'standard';
  }
  if (fallbackProfile === KEYSTONE_DERIVATION.ledger) {
    return 'ledger';
  }
  if (fallbackProfile === KEYSTONE_DERIVATION.standard) {
    return 'standard';
  }
  return 'standard';
}

/** True when at least one connect row has no Native/Ledger label from the device. */
export function keystoneConnectNeedsProfileChoice(keys) {
  return (keys || []).some(
    (k) =>
      k.profile !== KEYSTONE_DERIVATION.ledger &&
      k.profile !== KEYSTONE_DERIVATION.standard
  );
}

/**
 * Label unlabeled rows after the user names what they already exported.
 * Rows the device labeled are left unchanged.
 * @param {Array<{ account: number, publicKey: string, profile?: string | null, rowKey?: string, name?: string, cip1852Path?: string }>} keys
 * @param {KeystoneDerivationProfile} profile
 */
export function applyKeystoneFallbackProfile(keys, profile) {
  const p =
    profile === KEYSTONE_DERIVATION.ledger
      ? KEYSTONE_DERIVATION.ledger
      : KEYSTONE_DERIVATION.standard;
  const applied = (keys || []).map((k) => {
    if (
      k.profile === KEYSTONE_DERIVATION.ledger ||
      k.profile === KEYSTONE_DERIVATION.standard
    ) {
      return k;
    }
    return {
      ...k,
      profile: p,
      rowKey: `${k.account}-${p}`,
      name: formatKeystoneCardanoAccountLabel(k.account, p),
    };
  });
  const byRow = new Map();
  for (const row of applied) {
    const prev = byRow.get(row.rowKey);
    if (prev && prev.publicKey !== row.publicKey) {
      throw new Error(
        'Keystone returned two unlabeled keys for the same account. Export Cardano Native or Ledger from the device menu so Lucem can tell them apart.'
      );
    }
    byRow.set(row.rowKey, row);
  }
  return [...byRow.values()];
}

/** Storage suffix so account 0 Ledger vs standard can coexist */
export function keystoneAccountStorageSuffix(profile) {
  return profile === KEYSTONE_DERIVATION.ledger ? '-vledger' : '';
}

/**
 * Max CIP-1852 **account index** (0-based) for a single-path hardware-call QR.
 * Keystone supports `m/1852'/1815'/0'` … `m/1852'/1815'/23'` — indices **0–23** inclusive.
 */
export const KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX = 23;

/** @param {number} accountIndex — 0-based CIP-1852 account index */
export function cip1852AccountPath(accountIndex) {
  return `m/1852'/1815'/${accountIndex}'`;
}

/**
 * Stored / UI label: account index (the CIP-1852 path variable) + the derivation
 * profile in the device's own wording ("Ledger" vs "Cardano Native"). Kept short
 * so it reads well in the account list.
 * @param {number} accountIndex - 0-based CIP-1852 account index
 * @param {string} [profile]
 */
export function formatKeystoneCardanoAccountLabel(
  accountIndex,
  profile = KEYSTONE_DERIVATION.standard
) {
  const n = Number(accountIndex);
  const tail =
    profile === KEYSTONE_DERIVATION.ledger ? 'Ledger' : 'Cardano Native';
  return `Keystone ${n} · ${tail}`;
}

/**
 * QR the user shows to Keystone first (Hardware Call / key derivation).
 * One schema per requested CIP-1852 account index (default `[0]` only). More indices
 * mean a larger QR and more approvals on the device.
 * @param {object} [opts]
 * @param {string} [opts.origin]
 * @param {number[]} [opts.accountIndices] - 0-based CIP-1852 indices (deduped, sorted). Default `[0]`.
 * @param {number} [opts.accountIndex] - Shorthand for a single index (tests / callers).
 * @see https://dev.keyst.one/docs/integration-tutorial-advanced/hardware-call
 */
export function generateCardanoKeystoneKeyDerivationUr({
  origin = 'Lucem',
  accountIndices: accountIndicesIn,
  accountIndex,
} = {}) {
  let indices;
  if (Array.isArray(accountIndicesIn) && accountIndicesIn.length > 0) {
    indices = [
      ...new Set(
        accountIndicesIn.map((n) => Number(n)).filter((n) => Number.isInteger(n))
      ),
    ].sort((a, b) => a - b);
  } else if (accountIndex !== undefined && accountIndex !== null) {
    indices = [Number(accountIndex)];
  } else {
    indices = [0];
  }
  if (indices.length === 0) {
    throw new Error(
      'At least one Keystone account index is required (CIP-1852, 0–23).'
    );
  }
  for (const i of indices) {
    if (i < 0 || i > KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX) {
      throw new Error(
        `Invalid Keystone account index ${i}. Use 0–${KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX}.`
      );
    }
  }
  const schemas = indices.map((i) => ({
    path: cip1852AccountPath(i),
    curve: Curve.ed25519,
    algo: DerivationAlgorithm.bip32ed25519,
    chainType: 'ADA',
  }));

  return KeystoneSDK.generateKeyDerivationCall({
    schemas,
    origin,
    version: QRHardwareCallVersion.V1,
  });
}

/**
 * Keep only keys for the account the user requested; Keystone may still return extras.
 */
export function filterKeystoneKeysForRequestedAccount(
  keys,
  requestedAccountIndex
) {
  const want = Number(requestedAccountIndex);
  const filtered = (keys || []).filter((k) => k.account === want);
  if (filtered.length === 0) {
    throw new Error(
      `Keystone did not return account ${want} (${cip1852AccountPath(want)}). ` +
        'Export that account again from Keystone.'
    );
  }
  return filtered;
}

/**
 * Keep parsed rows for each requested account index (Native first, then Ledger).
 * @param {Array<{ account: number, profile?: string, rowKey?: string }>} keys
 * @param {number[]} requestedIndices
 */
export function filterKeystoneKeysForRequestedAccounts(keys, requestedIndices) {
  const order = [
    ...new Set((requestedIndices || []).map((n) => Number(n))),
  ].sort((a, b) => a - b);
  if (order.length === 0) {
    throw new Error('Select at least one Cardano account.');
  }
  for (const i of order) {
    if (
      !Number.isInteger(i) ||
      i < 0 ||
      i > KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX
    ) {
      throw new Error(
        `Invalid Keystone account index ${i}. Use 0–${KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX}.`
      );
    }
  }
  const list = keys || [];
  const out = [];
  for (const i of order) {
    const rows = list.filter((k) => k.account === i);
    if (rows.length === 0) {
      throw new Error(
        `Keystone did not return account ${i} (${cip1852AccountPath(i)}). ` +
          'Export again from the device with the same accounts selected in Lucem.'
      );
    }
    const standard = rows.filter(
      (r) => r.profile === KEYSTONE_DERIVATION.standard
    );
    const ledger = rows.filter((r) => r.profile === KEYSTONE_DERIVATION.ledger);
    const other = rows.filter(
      (r) =>
        r.profile !== KEYSTONE_DERIVATION.standard &&
        r.profile !== KEYSTONE_DERIVATION.ledger
    );
    // Cardano Native first — that is the receive address Keystone shows by default.
    out.push(...standard, ...ledger, ...other);
  }
  return out;
}

/**
 * Default-checked import rows for the profile the user matched on Keystone.
 * When both Native and Ledger exist, honor `preferredProfile` — do not rewrite
 * a Ledger export as Cardano Native.
 * @param {Array<{ account: number, profile: string, rowKey: string }>} keys
 * @param {string} [preferredProfile]
 * @returns {string[]}
 */
export function preferredKeystoneImportRowKeys(keys, preferredProfile) {
  const prefer =
    preferredProfile === KEYSTONE_DERIVATION.ledger
      ? KEYSTONE_DERIVATION.ledger
      : KEYSTONE_DERIVATION.standard;
  const byAccount = new Map();
  for (const k of keys || []) {
    if (!byAccount.has(k.account)) byAccount.set(k.account, []);
    byAccount.get(k.account).push(k);
  }
  const out = [];
  for (const rows of byAccount.values()) {
    const match = rows.find((r) => r.profile === prefer);
    out.push((match || rows[0]).rowKey);
  }
  return out;
}

/**
 * Connect flow: add **one** Lucem account per Keystone sync. Firmware often puts several
 * CIP-1852 rows in one `crypto-multi-accounts` UR (e.g. after a multi-path hardware call);
 * we keep a single row so the UI never bulk-imports. Order follows {@link parseKeystoneCardanoConnectUr}
 * (UR / first-seen order). When several rows are present we keep the **first**; if that does not
 * match the account you chose on Keystone, try again after switching the active Cardano account
 * or contact Keystone — the UR does not label which row is “current”.
 * @param {Array<{ rowKey: string }>} keys
 */
export function trimKeystoneConnectKeysToOne(keys) {
  if (!keys || keys.length <= 1) return keys;
  return [keys[0]];
}

export function urFromScan({ type, cbor }) {
  return new UR(Buffer.from(cbor, 'hex'), type);
}

/**
 * Parse Keystone sync QR (crypto-multi-accounts or crypto-hdkey).
 * Profile comes only from device metadata. Unlabeled rows have `profile: null`
 * so the wallet can ask once after the scan.
 * @returns {{ masterFingerprint: string, keys: Array<{ account: number, publicKey: string, name: string, cip1852Path: string, profile: KeystoneDerivationProfile | null, rowKey: string }> }}
 */
export function parseKeystoneCardanoConnectUr(scan) {
  const sdk = new KeystoneSDK();
  const ur = urFromScan(scan);
  let masterFingerprint;
  let keys;

  if (ur.type === URType.CryptoMultiAccounts) {
    const multi = sdk.parseMultiAccounts(ur);
    masterFingerprint = (multi.masterFingerprint || '').toLowerCase();
    keys = multi.keys || [];
  } else if (ur.type === URType.CryptoHDKey) {
    const one = sdk.parseHDKey(ur);
    masterFingerprint = (one.xfp || '').toLowerCase();
    keys = [
      {
        chain: one.chain,
        path: one.path,
        publicKey: one.publicKey,
        name: one.name,
        chainCode: one.chainCode,
        note: one.note,
      },
    ];
  } else {
    throw new Error(
      'Unexpected QR type. After scanning the Lucem QR on Keystone, scan the animated QR Keystone shows (multi-accounts or HD key).'
    );
  }

  if (!masterFingerprint) {
    throw new Error('Invalid Keystone QR: missing master fingerprint.');
  }

  /** Raw ADA rows with profile inferred from UR only. */
  const rawAdaRows = [];
  let skippedNonAccountNode = false;
  for (const k of keys) {
    if (k.chain !== 'ADA') continue;
    const account = parseCip1852AccountIndexFromPath(k.path || '');
    if (account == null) continue;
    if (!isCip1852AccountNodePath(k.path || '')) {
      skippedNonAccountNode = true;
      continue;
    }
    const pub = (k.publicKey || '').toLowerCase();
    const chain = (k.chainCode || '').toLowerCase();
    if (pub.length !== 64 || chain.length !== 64) {
      throw new Error(
        'Keystone QR is missing chain code or public key (use Cardano account sync on the device).'
      );
    }
    const inferred = inferKeystoneDerivationProfileOrNull(k.note, k.name);
    rawAdaRows.push({
      account,
      publicKey: pub + chain,
      inferred,
    });
  }

  if (rawAdaRows.length === 0) {
    throw new Error(
      skippedNonAccountNode
        ? "Keystone exported a payment or stake key instead of the account key (m/1852'/1815'/N'). Export the Cardano account again from the device."
        : "No Cardano (ADA) account keys found in this QR. Use CIP-1852 paths m/1852'/1815'/… on the device (Ledger-compatible or Cardano standard)."
    );
  }

  const accountOrder = [];
  const byAccount = new Map();
  for (const row of rawAdaRows) {
    if (!byAccount.has(row.account)) {
      accountOrder.push(row.account);
      byAccount.set(row.account, []);
    }
    byAccount.get(row.account).push(row);
  }

  const adaAccounts = [];
  for (const account of accountOrder) {
    const rows = byAccount.get(account);
    for (const r of rows) {
      const profile = r.inferred;
      adaAccounts.push({
        account,
        publicKey: r.publicKey,
        cip1852Path: cip1852AccountPath(account),
        profile,
        rowKey: profile
          ? `${account}-${profile}`
          : `${account}-unlabeled-${r.publicKey.slice(0, 8)}`,
        name: profile
          ? formatKeystoneCardanoAccountLabel(account, profile)
          : `Keystone ${account}`,
      });
    }
  }

  /** Preserve sync QR key order (device / firmware order), not sorted by account index. */
  const byRow = new Map();
  const order = [];
  for (const row of adaAccounts) {
    const prev = byRow.get(row.rowKey);
    if (prev) {
      if (prev.publicKey === row.publicKey) continue;
      throw new Error(
        'Keystone returned different keys for the same account and derivation profile. Export again from the device.'
      );
    }
    byRow.set(row.rowKey, row);
    order.push(row.rowKey);
  }
  const deduped = order.map((rk) => byRow.get(rk));

  return { masterFingerprint, keys: deduped };
}

export function normalizeKeystoneXfp(id) {
  const hex = String(id || '')
    .toLowerCase()
    .replace(/^0x/, '');
  if (!/^[0-9a-f]{8}$/.test(hex)) {
    throw new Error(
      'This Keystone account is missing a valid master fingerprint. Reconnect the device and import again.'
    );
  }
  return hex;
}

function ed25519KeyHashHex(kh) {
  if (!kh) return '';
  if (typeof kh.to_hex === 'function') return kh.to_hex();
  return Buffer.from(kh.to_bytes()).toString('hex');
}

export function requiredSignerHashesFromTx(tx) {
  const rs = tx.body().required_signers();
  if (!rs) return [];
  const out = [];
  for (let i = 0; i < rs.len(); i += 1) {
    const hex = ed25519KeyHashHex(rs.get(i));
    if (hex) out.push(hex);
  }
  return out;
}

function networkIdFromAccount(Cardano, account) {
  try {
    if (account?.paymentAddr) {
      return Cardano.Address.from_bech32(account.paymentAddr).network_id();
    }
  } catch (/** @type {any} */ _) {
    /* fall through */
  }
  return 0;
}

function txHasStakeDuty(tx) {
  const certs = tx.body().certs();
  const withdrawals = tx.body().withdrawals();
  return (certs && certs.len() > 0) || (withdrawals && withdrawals.len() > 0);
}

function resolveKeystoneHdPath(Cardano, account, hw, keyHash, networkId) {
  if (!keyHash) return null;
  const rows = listEnabledPaymentAddresses(Cardano, account, networkId);
  const row = rows.find((r) => r.paymentKeyHash === keyHash);
  if (row) {
    return cip1852PaymentPath(hw.account, row.role ?? 0, row.index ?? 0);
  }
  if (keyHash === account.stakeKeyHash) {
    return `m/1852'/1815'/${hw.account}'/2/0`;
  }
  return null;
}

/**
 * Extra Keystone signers: body required_signers we can resolve, every payment
 * key the wallet asked to sign, and the stake key when certs/withdrawals need it.
 * Firmware skips a signer whose xfp does not match the device.
 */
export function buildKeystoneExtraSigners(tx, account, hw, keyHashes, Cardano) {
  const xfp = normalizeKeystoneXfp(hw.id);
  const networkId = networkIdFromAccount(Cardano, account);
  const bodyRequired = new Set(requiredSignerHashesFromTx(tx));
  const needed = new Set(
    [...(keyHashes || []), ...bodyRequired].filter(Boolean)
  );
  const hasStakeDuty = txHasStakeDuty(tx);

  const extra = [];
  const seenPath = new Set();
  for (const keyHash of needed) {
    const isStake = keyHash === account.stakeKeyHash;
    if (isStake && !hasStakeDuty && !bodyRequired.has(keyHash)) {
      continue;
    }
    const keyPath = resolveKeystoneHdPath(
      Cardano,
      account,
      hw,
      keyHash,
      networkId
    );
    if (!keyPath || seenPath.has(keyPath)) continue;
    seenPath.add(keyPath);
    extra.push({ keyHash, xfp, keyPath });
  }
  return extra;
}

export function cardanoTxBodyHashHex(Cardano, tx) {
  const fixed = Cardano.FixedTransactionBody.from_bytes(tx.body().to_bytes());
  const hex = Buffer.from(fixed.tx_hash().to_bytes()).toString('hex');
  if (typeof fixed.free === 'function') fixed.free();
  return hex;
}

function cryptoKeypathFromHdPath(hdPath, xfp) {
  const steps = String(hdPath || '')
    .replace(/^[mM]\//, '')
    .split('/')
    .filter(Boolean);
  return new CryptoKeypath(
    steps.map((step) => {
      const hardened = step.endsWith("'");
      const index = parseInt(step.replace(/'/g, ''), 10);
      return new PathComponent({ index, hardened });
    }),
    Buffer.from(xfp, 'hex')
  );
}

export function vkeyHashesFromWitnessSet(Cardano, witnessSet) {
  const vkeys = witnessSet?.vkeys?.();
  if (!vkeys || typeof vkeys.len !== 'function' || vkeys.len() === 0) {
    return [];
  }
  const out = [];
  for (let i = 0; i < vkeys.len(); i += 1) {
    const pub = vkeys.get(i).vkey().public_key();
    out.push(ed25519KeyHashHex(pub.hash()));
  }
  return out;
}

/**
 * Message for a Keystone reply that carried no witness set.
 *
 * @param {{ usedTxHash?: boolean, inputCount?: number }} [signMode] - how the
 *   request was sent; a hash request means the device only saw a hash.
 */
export function emptyWitnessSetMessage(signMode) {
  if (signMode?.usedTxHash) {
    const inputs = signMode.inputCount
      ? `${signMode.inputCount} inputs`
      : 'many inputs';
    return (
      'Keystone returned no signature. This transaction is too large for the ' +
      `device to display (${inputs}), so it was sent as a hash-only request ` +
      'and Keystone warns that the data is not readable. Send a smaller ' +
      'amount so fewer UTxOs are needed, or consolidate your UTxOs first.'
    );
  }
  return (
    'Keystone returned no signature. Approve the transaction on the device ' +
    'before scanning the QR, and make sure the account you imported into ' +
    'Lucem is the one shown on the device.'
  );
}

export function formatKeystoneSubmitError(err) {
  const msg = err && err.message ? String(err.message) : String(err || '');
  if (/MissingVKeyWitnesses/i.test(msg)) {
    return (
      'Keystone did not provide a required signature. On the device, use the ' +
      'same Cardano derivation you imported in Lucem (Native vs Ledger), then try again.'
    );
  }
  if (/InvalidWitnesses|VKeyWitnessesDoesNotVerify/i.test(msg)) {
    return 'Keystone signed a different transaction hash than Lucem submitted. Close this screen and send again.';
  }
  if (/FeeTooSmallUTxO/i.test(msg)) {
    return 'The network rejected this transaction because the fee was too small. Try sending again.';
  }
  if (/Koios API error:\s*400/i.test(msg)) {
    return 'The network rejected this transaction. Use Copy error if you need the technical details.';
  }
  return msg || 'Keystone signing failed.';
}

/**
 * Reject an empty or incomplete Keystone witness set before submit.
 * @param {*} Cardano
 * @param {*} tx
 * @param {*} witnessSet
 * @param {string[]} [requiredHashes] - extra hashes (spent payment keys)
 */
export function assertKeystoneWitnessesCover(
  Cardano,
  tx,
  witnessSet,
  requiredHashes = []
) {
  const have = new Set(
    vkeyHashesFromWitnessSet(Cardano, witnessSet).map((h) => h.toLowerCase())
  );
  if (have.size === 0) {
    throw new Error(
      'Keystone returned an empty signature. Scan the signature QR again, and confirm the device is using the same Native/Ledger profile as this Lucem account.'
    );
  }
  const needed = new Set(
    [...requiredSignerHashesFromTx(tx), ...(requiredHashes || [])]
      .filter(Boolean)
      .map((h) => String(h).toLowerCase())
  );
  const missing = [...needed].filter((h) => !have.has(h));
  if (missing.length > 0) {
    throw new Error(
      'Keystone signed a different key than this wallet expected. On the device, switch to the same Cardano derivation you imported in Lucem (Native vs Ledger).'
    );
  }
}

function formatAdaFromLovelace(lovelace) {
  const n = BigInt(lovelace || '0');
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 1000000n;
  const frac = (abs % 1000000n).toString().padStart(6, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Lovelace claimed from reward accounts, or '0' when the tx withdraws none. */
function totalWithdrawalLovelace(body) {
  try {
    const withdrawals = body.withdrawals?.();
    if (!withdrawals || withdrawals.len() === 0) return '0';
    const keys = withdrawals.keys();
    let sum = 0n;
    for (let i = 0; i < keys.len(); i += 1) {
      sum += BigInt(withdrawals.get(keys.get(i)).to_str());
    }
    return sum.toString();
  } catch (e) {
    return '0';
  }
}

/**
 * Human review of an unsigned payment tx: inputs (spent UTxOs) vs outputs
 * (recipient + change). Keystone's device UI lists both; change back to the
 * spending address looks like "the same input and output" unless labeled.
 * @param {*} tx - CSL Transaction
 * @param {Array} [utxos] - CSL TransactionUnspentOutput[]
 */
export function summarizeUnsignedPaymentTx(tx, utxos = []) {
  const body = tx.body();
  const inputs = [];
  const inLen = body.inputs().len();
  for (let i = 0; i < inLen; i += 1) {
    const inp = body.inputs().get(i);
    const txHash = Buffer.from(inp.transaction_id().to_bytes()).toString('hex');
    const idx = transactionInputIndex(inp);
    const match = (utxos || []).find((u) => {
      const h = Buffer.from(u.input().transaction_id().to_bytes()).toString(
        'hex'
      );
      return h === txHash && transactionInputIndex(u.input()) === idx;
    });
    const lovelace = match ? match.output().amount().coin().to_str() : null;
    let address = null;
    if (match) {
      try {
        address = match.output().address().to_bech32();
      } catch (e) {
        address = null;
      }
    }
    inputs.push({
      txHash,
      index: idx,
      address,
      lovelace,
      ada: lovelace != null ? formatAdaFromLovelace(lovelace) : null,
    });
  }

  const inputAddresses = new Set(
    inputs.map((row) => row.address).filter(Boolean)
  );
  const outputs = [];
  const outLen = body.outputs().len();
  for (let i = 0; i < outLen; i += 1) {
    const out = body.outputs().get(i);
    let address = '';
    try {
      address = out.address().to_bech32();
    } catch (e) {
      address = '';
    }
    const lovelace = out.amount().coin().to_str();
    const isChange = Boolean(address && inputAddresses.has(address));
    outputs.push({
      address,
      lovelace,
      ada: formatAdaFromLovelace(lovelace),
      kind: isChange ? 'change' : 'payment',
    });
  }

  const fee = body.fee().to_str();
  const withdrawalLovelace = totalWithdrawalLovelace(body);
  return {
    fee,
    feeAda: formatAdaFromLovelace(fee),
    inputs,
    outputs,
    withdrawalLovelace,
    withdrawalAda:
      withdrawalLovelace === '0'
        ? null
        : formatAdaFromLovelace(withdrawalLovelace),
  };
}

/**
 * Build UR for Keystone to scan (unsigned tx).
 * @param {object} opts
 * @param {string} opts.txHex - Full transaction CBOR hex
 * @param {object} opts.account - Current account object from storage
 * @param {{ device: string, id: string, account: number }} opts.hw - From indexToHw
 * @param {Array} opts.utxos - CSL TransactionUnspentOutput[] from getUtxos()
 * @param {string[]} opts.keyHashes - Key hashes requested for signing
 */
export async function buildKeystoneCardanoSignRequest({
  txHex,
  account,
  hw,
  utxos,
  keyHashes,
}) {
  await Loader.load();
  const tx = Loader.Cardano.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
  const inputs = tx.body().inputs();
  const xfp = normalizeKeystoneXfp(hw.id);
  const keystoneUtxos = [];

  for (let i = 0; i < inputs.len(); i++) {
    const inp = inputs.get(i);
    const txHash = Buffer.from(inp.transaction_id().to_bytes()).toString('hex');
    const idx = transactionInputIndex(inp);

    const match = utxos.find((u) => {
      const h = Buffer.from(u.input().transaction_id().to_bytes()).toString('hex');
      const ix = transactionInputIndex(u.input());
      return h === txHash && ix === idx;
    });
    if (!match) {
      throw new Error('Could not resolve a wallet UTxO for a transaction input.');
    }

    const output = match.output();
    const addr = Loader.Cardano.Address.from_bytes(output.address().to_bytes());
    const addrBech32 = addr.to_bech32();
    const paymentRow = findEnabledPaymentByAddress(
      Loader.Cardano,
      account,
      addr.network_id(),
      addrBech32
    );
    if (!paymentRow) {
      throw new Error(
        'This transaction spends from an address that is not an enabled payment or change address for this wallet.'
      );
    }

    const amount = output.amount().coin().to_str();
    keystoneUtxos.push({
      transactionHash: txHash,
      index: idx,
      amount,
      xfp,
      hdPath: cip1852PaymentPath(
        hw.account,
        paymentRow.role ?? 0,
        paymentRow.index ?? 0
      ),
      address: addrBech32,
    });
  }

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Never let the SDK hash the full Transaction CBOR (that is not the tx id).
  const sdk = new KeystoneSDK({
    sizeLimit: { ada: Number.MAX_SAFE_INTEGER },
  });
  const extraSigners = buildKeystoneExtraSigners(
    tx,
    account,
    hw,
    keyHashes,
    Loader.Cardano
  );
  const signData = Buffer.from(txHex, 'hex');
  const usedTxHash = keystoneNeedsTxHashRequest(signData.length);
  let ur;
  if (usedTxHash) {
    const paths = [
      ...keystoneUtxos.map((u) => cryptoKeypathFromHdPath(u.hdPath, xfp)),
      ...extraSigners.map((s) => cryptoKeypathFromHdPath(s.keyPath, xfp)),
    ];
    ur = sdk.cardano.generateSignTxHashRequest(
      cardanoTxBodyHashHex(Loader.Cardano, tx),
      paths,
      keystoneUtxos.map((u) => u.address),
      'Lucem',
      requestId
    );
  } else {
    ur = sdk.cardano.generateSignRequest({
      requestId,
      signData,
      utxos: keystoneUtxos,
      extraSigners,
      origin: 'Lucem',
    });
  }

  return { ur, requestId, sdk, usedTxHash, inputCount: inputs.len() };
}

export function spentPaymentKeyHashes(Cardano, tx, account, utxos = []) {
  const hashes = [];
  const seen = new Set();
  const inputs = tx.body().inputs();
  for (let i = 0; i < inputs.len(); i += 1) {
    const inp = inputs.get(i);
    const txHash = Buffer.from(inp.transaction_id().to_bytes()).toString('hex');
    const idx = transactionInputIndex(inp);
    const match = (utxos || []).find((u) => {
      const h = Buffer.from(u.input().transaction_id().to_bytes()).toString(
        'hex'
      );
      return h === txHash && transactionInputIndex(u.input()) === idx;
    });
    if (!match) continue;
    const addr = Cardano.Address.from_bytes(match.output().address().to_bytes());
    const row = findEnabledPaymentByAddress(
      Cardano,
      account,
      addr.network_id(),
      addr.to_bech32()
    );
    const hex = row?.paymentKeyHash;
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      hashes.push(hex);
    }
  }
  return hashes;
}

export function parseKeystoneCardanoTxSignature(sdk, scan) {
  const ur = urFromScan(scan);
  return sdk.cardano.parseSignature(ur);
}

export function witnessSetHexFromKeystoneSignature(sig) {
  return sig.witnessSet;
}
