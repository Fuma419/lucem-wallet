/**
 * Keystone air-gapped helpers (Cardano CIP-1852) using @keystonehq/keystone-sdk.
 */

import KeystoneSDK, {
  UR,
  URType,
  Curve,
  DerivationAlgorithm,
  QRHardwareCallVersion,
} from '@keystonehq/keystone-sdk';
import Loader from './loader';

const CARDANO_ACCOUNT_PATH_RE = /^m\/1852'\/1815'\/(\d+)'$/i;

/**
 * Default: first Cardano account only (CIP-1852 `m/1852'/1815'/0'`, i.e. “Account 1”).
 * A single schema keeps the hardware-call QR small so Keystone accepts it.
 */
export const KEYSTONE_CARDANO_ACCOUNT_SLOTS = 1;

/**
 * QR the user shows to Keystone first (Hardware Call / key derivation).
 * Keystone scans this, then displays the sync QR for the wallet to scan.
 * @param {number} [accountCount] — number of consecutive accounts from index 0 (default 1).
 * @see https://dev.keyst.one/docs/integration-tutorial-advanced/hardware-call
 */
export function generateCardanoKeystoneKeyDerivationUr({
  origin = 'Lucem',
  accountCount = KEYSTONE_CARDANO_ACCOUNT_SLOTS,
} = {}) {
  const schemas = [];
  for (let i = 0; i < accountCount; i++) {
    schemas.push({
      path: `m/1852'/1815'/${i}'`,
      curve: Curve.ed25519,
      algo: DerivationAlgorithm.bip32ed25519,
      chainType: 'ADA',
    });
  }
  return KeystoneSDK.generateKeyDerivationCall({
    schemas,
    origin,
    version: QRHardwareCallVersion.V1,
  });
}

export function urFromScan({ type, cbor }) {
  return new UR(Buffer.from(cbor, 'hex'), type);
}

/**
 * Parse Keystone sync QR (crypto-multi-accounts or crypto-hdkey).
 * @returns {{ masterFingerprint: string, keys: Array<{ account: number, publicKey: string, name: string }> }}
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
    const m = (k.path || '').match(CARDANO_ACCOUNT_PATH_RE);
    if (!m) continue;
    const pub = (k.publicKey || '').toLowerCase();
    const chain = (k.chainCode || '').toLowerCase();
    if (pub.length !== 64 || chain.length !== 64) {
      throw new Error(
        'Keystone QR is missing chain code or public key (use Cardano account sync on the device).'
      );
    }
    adaAccounts.push({
      account: parseInt(m[1], 10),
      publicKey: pub + chain,
      name: k.name || `Keystone ${parseInt(m[1], 10) + 1}`,
    });
  }

  if (adaAccounts.length === 0) {
    throw new Error('No Cardano (ADA) account keys found in this QR.');
  }

  adaAccounts.sort((a, b) => a.account - b.account);

  return { masterFingerprint, keys: adaAccounts };
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
