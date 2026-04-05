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
export function inferKeystoneDerivationProfile(note, name) {
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
  return KEYSTONE_DERIVATION.standard;
}

/** Storage suffix so account 0 Ledger vs standard can coexist */
export function keystoneAccountStorageSuffix(profile) {
  return profile === KEYSTONE_DERIVATION.ledger ? '-vledger' : '';
}

/**
 * Max CIP-1852 **account index** (0-based) in the default multi-slot hardware-call QR.
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
 * By default requests **every** CIP-1852 account slot (`m/1852'/1815'/0'…N'`) so the
 * user picks the account **on Keystone**; the sync QR then contains only what they
 * exported (typically one account).
 * @param {object} [opts]
 * @param {string} [opts.origin]
 * @param {number} [opts.accountIndex] — If set, request a **single** path (tests / advanced).
 *   Omit for device-driven export (all slots 0…{@link KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX}).
 * @see https://dev.keyst.one/docs/integration-tutorial-advanced/hardware-call
 */
export function generateCardanoKeystoneKeyDerivationUr({
  origin = 'Lucem',
  accountIndex,
} = {}) {
  const schemaForIndex = (i) => ({
    path: cip1852AccountPath(i),
    curve: Curve.ed25519,
    algo: DerivationAlgorithm.bip32ed25519,
    chainType: 'ADA',
  });

  let schemas;
  if (accountIndex !== undefined && accountIndex !== null) {
    const i = Number(accountIndex);
    if (
      !Number.isInteger(i) ||
      i < 0 ||
      i > KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX
    ) {
      throw new Error(
        `Invalid Keystone account index ${accountIndex}. Use 0–${KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX}.`
      );
    }
    schemas = [schemaForIndex(i)];
  } else {
    schemas = [];
    for (let i = 0; i <= KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX; i++) {
      schemas.push(schemaForIndex(i));
    }
  }

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

  const adaAccounts = [];
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
    const profile =
      forceExportProfile === KEYSTONE_DERIVATION.ledger ||
      forceExportProfile === KEYSTONE_DERIVATION.standard
        ? forceExportProfile
        : inferKeystoneDerivationProfile(k.note, k.name);
    const rowKey = `${account}-${profile}`;
    adaAccounts.push({
      account,
      publicKey: pub + chain,
      cip1852Path: cip1852AccountPath(account),
      profile,
      rowKey,
      name: formatKeystoneCardanoAccountLabel(account, profile),
    });
  }

  if (adaAccounts.length === 0) {
    throw new Error(
      'No Cardano (ADA) account keys found in this QR. Use CIP-1852 paths m/1852\'/1815\'/… on the device (Ledger-compatible or Cardano standard).'
    );
  }

  const byRow = new Map();
  for (const row of adaAccounts) {
    const prev = byRow.get(row.rowKey);
    if (prev) {
      if (prev.publicKey === row.publicKey) continue;
      throw new Error(
        'Keystone returned different keys for the same account and derivation profile. Export again from the device.'
      );
    }
    byRow.set(row.rowKey, row);
  }
  const deduped = Array.from(byRow.values());

  deduped.sort((a, b) =>
    a.account !== b.account
      ? a.account - b.account
      : a.profile.localeCompare(b.profile)
  );

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
  const tx = Loader.Cardano.Transaction.from_cbor_bytes(Buffer.from(txHex, 'hex'));
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
    const addrBech32 = addr.to_bech32();
    if (addrBech32 !== account.paymentAddr) {
      throw new Error(
        'This transaction spends from an address this wallet does not treat as its primary payment address.'
      );
    }

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

  const sdk = new KeystoneSDK();
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
