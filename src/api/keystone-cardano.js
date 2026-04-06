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
import Loader from './loader';

/**
 * CIP-1852 account node or deeper (payment/stake leaf). Keystone may report either
 * depending on firmware / export mode; the account index is always the third step.
 */
const CIP1852_ACCOUNT_STEP_RE =
  /^m\/1852'\/1815'\/(\d+)'(?:\/\d+\/\d+)?$/i;

/** @typedef {'standard' | 'ledger'} KeystoneDerivationProfile */

export const KEYSTONE_DERIVATION = {
  standard: 'standard',
  ledger: 'ledger',
};

/**
 * Animated QR for Cardano **sign** requests: larger UR fragments + faster cycling
 * shorten air-gap transfer vs @keystonehq/animated-qr defaults (400 / 100ms).
 */
export const KEYSTONE_SIGN_ANIMATED_QR_OPTIONS = Object.freeze({
  size: 280,
  capacity: 900,
  interval: 72,
});

/**
 * @keystonehq/keystone-sdk uses full tx CBOR in UR below this byte length; at/above
 * it switches to CardanoSignTxHashRequest (smaller QR). Default SDK value is 2048,
 * which keeps typical stake/register/delegate txs on the slow full-tx path.
 */
const KEYSTONE_ADA_PREFER_TX_HASH_UNDER_BYTES = 768;

const LEDGER_DERIVATION_HINT =
  /ledger|bit\s*box|bitbox|lbx2|\blbx\b|ledger_live|ledger_legacy/i;
/** Avoid matching generic “Cardano” in wallet names — that falsely implied standard. */
const STANDARD_DERIVATION_HINT =
  /\bicarus\b|\byoroi\b|\bdaedalus\b|\beternl\b|\btyphon\b|\bnami\b|account\.standard\b/i;

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
    } catch (_) {
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
 * Stored / UI label: path + which derivation profile Keystone reported.
 * @param {number} accountIndex — 0-based CIP-1852 account index
 * @param {KeystoneDerivationProfile} [profile]
 */
export function formatKeystoneCardanoAccountLabel(
  accountIndex,
  profile = KEYSTONE_DERIVATION.standard
) {
  const n = Number(accountIndex);
  const path = cip1852AccountPath(n);
  const tail =
    profile === KEYSTONE_DERIVATION.ledger
      ? 'Ledger-compatible'
      : 'Cardano standard';
  return `Keystone · Account ${n} · ${path} · ${tail}`;
}

/**
 * QR the user shows to Keystone first (Hardware Call / key derivation).
 * One schema per requested CIP-1852 account index (default `[0]` only). More indices
 * mean a larger QR and more approvals on the device.
 * @param {object} [opts]
 * @param {string} [opts.origin]
 * @param {number[]} [opts.accountIndices] — 0-based CIP-1852 indices (deduped, sorted). Default `[0]`.
 * @param {number} [opts.accountIndex] — Shorthand for a single index (tests / callers).
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
 * Keep one parsed row per requested account index (in ascending index order).
 * @param {Array<{ account: number }>} keys
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
    const row = list.find((k) => k.account === i);
    if (!row) {
      throw new Error(
        `Keystone did not return account ${i} (${cip1852AccountPath(i)}). ` +
          'Export again from the device with the same accounts selected in Lucem.'
      );
    }
    out.push(row);
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
 * @param {{ forceExportProfile?: KeystoneDerivationProfile }} [options]
 *   When set, overrides UR metadata (use when Auto-detect is wrong for your firmware).
 * @returns {{ masterFingerprint: string, keys: Array<{ account: number, publicKey: string, name: string, cip1852Path: string, profile: KeystoneDerivationProfile, rowKey: string }> }}
 */
export function parseKeystoneCardanoConnectUr(scan, options = {}) {
  const { forceExportProfile } = options;
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

  const coerceKeystoneForceExportProfile = (fp) => {
    if (fp === KEYSTONE_DERIVATION.ledger || fp === 'ledger') {
      return KEYSTONE_DERIVATION.ledger;
    }
    if (fp === KEYSTONE_DERIVATION.standard || fp === 'standard') {
      return KEYSTONE_DERIVATION.standard;
    }
    return null;
  };
  const forcedProfile = coerceKeystoneForceExportProfile(forceExportProfile);

  /** Raw ADA rows with profile inferred from UR only (never UI override). */
  const rawAdaRows = [];
  for (const k of keys) {
    if (k.chain !== 'ADA') continue;
    const account = parseCip1852AccountIndexFromPath(k.path || '');
    if (account == null) continue;
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
      'No Cardano (ADA) account keys found in this QR. Use CIP-1852 paths m/1852\'/1815\'/… on the device (Ledger-compatible or Cardano standard).'
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
    if (!forcedProfile) {
      for (const r of rows) {
        const profile = r.inferred ?? KEYSTONE_DERIVATION.standard;
        adaAccounts.push({
          account,
          publicKey: r.publicKey,
          cip1852Path: cip1852AccountPath(account),
          profile,
          rowKey: `${account}-${profile}`,
          name: formatKeystoneCardanoAccountLabel(account, profile),
        });
      }
      continue;
    }

    const matches = rows.filter((r) => r.inferred === forcedProfile);
    if (matches.length >= 1) {
      adaAccounts.push({
        account,
        publicKey: matches[0].publicKey,
        cip1852Path: cip1852AccountPath(account),
        profile: forcedProfile,
        rowKey: `${account}-${forcedProfile}`,
        name: formatKeystoneCardanoAccountLabel(account, forcedProfile),
      });
      continue;
    }

    /**
     * Keystone often omits note/name on ADA sync URs. If there is exactly one row
     * and no derivation hint, trust the Advanced option the user already matched on
     * the device (Ledger vs standard).
     */
    const onlyAmbiguousSingleRow =
      rows.length === 1 && rows[0].inferred == null;
    if (
      onlyAmbiguousSingleRow &&
      (forcedProfile === KEYSTONE_DERIVATION.standard ||
        forcedProfile === KEYSTONE_DERIVATION.ledger)
    ) {
      adaAccounts.push({
        account,
        publicKey: rows[0].publicKey,
        cip1852Path: cip1852AccountPath(account),
        profile: forcedProfile,
        rowKey: `${account}-${forcedProfile}`,
        name: formatKeystoneCardanoAccountLabel(account, forcedProfile),
      });
      continue;
    }

    const wantLedger = forcedProfile === KEYSTONE_DERIVATION.ledger;
    const got = rows
      .map((r) => r.inferred ?? 'unspecified')
      .filter((v, i, a) => a.indexOf(v) === i);
    throw new Error(
      `This Keystone QR does not include a ${wantLedger ? 'Ledger-compatible' : 'Cardano standard'} key for account ${account} (metadata says: ${got.join(', ')}). ` +
        `You picked ${wantLedger ? 'Ledger-compatible' : 'Cardano standard'} in Lucem Advanced — export the matching address type on Keystone, or switch the derivation in Lucem to what the device actually exported.`
    );
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

function buildKeystoneExtraSigners(tx, account, hw, keyHashes) {
  const xfp = hw.id;
  const stakePath = `m/1852'/1815'/${hw.account}'/2/0`;
  const needStake = keyHashes.includes(account.stakeKeyHash);
  if (!needStake) return [];

  const certs = tx.body().certs();
  const withdrawals = tx.body().withdrawals();
  const hasCerts = certs && certs.len() > 0;
  const hasWd = withdrawals && withdrawals.len() > 0;
  if (!hasCerts && !hasWd) return [];

  return [
    {
      keyHash: account.stakeKeyHash,
      xfp,
      keyPath: stakePath,
    },
  ];
}

/**
 * Build UR for Keystone to scan (unsigned tx).
 * @param {string} txHex - Full transaction CBOR hex
 * @param {object} account - Current account object from storage
 * @param {{ device: string, id: string, account: number }} hw - From indexToHw
 * @param {Array} utxos - CSL TransactionUnspentOutput[] from getUtxos()
 * @param {string[]} keyHashes - Key hashes requested for signing
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
  const xfp = hw.id;
  const paymentBase = `m/1852'/1815'/${hw.account}'/0`;
  const keystoneUtxos = [];

  for (let i = 0; i < inputs.len(); i++) {
    const inp = inputs.get(i);
    const txHash = Buffer.from(inp.transaction_id().to_bytes()).toString('hex');
    const idx = parseInt(inp.index().to_str(), 10);

    const match = utxos.find((u) => {
      const h = Buffer.from(u.input().transaction_id().to_bytes()).toString('hex');
      const ix = parseInt(u.input().index().to_str(), 10);
      return h === txHash && ix === idx;
    });
    if (!match) {
      throw new Error('Could not resolve a wallet UTxO for a transaction input.');
    }

    const output = match.output();
    const addr = Loader.Cardano.Address.from_bytes(output.address().to_bytes());
    const expected = Loader.Cardano.Address.from_bech32(account.paymentAddr);
    if (
      Buffer.from(addr.to_bytes()).compare(Buffer.from(expected.to_bytes())) !==
      0
    ) {
      throw new Error(
        'This transaction spends from an address this wallet does not treat as its primary payment address.'
      );
    }
    const addrBech32 = addr.to_bech32();

    const amount = output.amount().coin().to_str();
    keystoneUtxos.push({
      transactionHash: txHash,
      index: idx,
      amount,
      xfp,
      hdPath: `${paymentBase}/0`,
      address: addrBech32,
    });
  }

  const requestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const sdk = new KeystoneSDK({
    sizeLimit: { ada: KEYSTONE_ADA_PREFER_TX_HASH_UNDER_BYTES },
  });
  const extraSigners = buildKeystoneExtraSigners(tx, account, hw, keyHashes);
  const ur = sdk.cardano.generateSignRequest({
    requestId,
    signData: Buffer.from(txHex, 'hex'),
    utxos: keystoneUtxos,
    extraSigners,
    origin: 'Lucem',
  });

  return { ur, requestId, sdk };
}

export function parseKeystoneCardanoTxSignature(sdk, scan) {
  const ur = urFromScan(scan);
  return sdk.cardano.parseSignature(ur);
}

export function witnessSetHexFromKeystoneSignature(sig) {
  return sig.witnessSet;
}
