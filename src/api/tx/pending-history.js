/**
 * Optimistic history: after any submit, prepend the tx hash and a pending
 * stub so the wallet UI can show it before Koios indexes the block.
 */
import { EVENT, SENDER, STORAGE, TARGET } from '../../config/config';
import platform from '../../platform';
import Loader from '../loader';
import {
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  setStorage,
} from '../extension/storage';
import { classifyCslTx } from './tx-kind';

const TX_HASH_RE = /^[a-f0-9]{64}$/i;

export const normalizeSubmittedHash = (result) => {
  if (typeof result === 'string') {
    const trimmed = result.trim().replace(/^"+|"+$/g, '');
    return TX_HASH_RE.test(trimmed) ? trimmed.toLowerCase() : '';
  }
  if (result && typeof result === 'object') {
    const candidate = result.hash || result.txHash || result.tx_hash;
    if (typeof candidate === 'string' && TX_HASH_RE.test(candidate.trim())) {
      return candidate.trim().toLowerCase();
    }
  }
  return '';
};

const hashFromTxHex = (Cardano, txHex) => {
  const tx =
    typeof Cardano.Transaction.from_hex === 'function'
      ? Cardano.Transaction.from_hex(txHex)
      : Cardano.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
  const fixed = Cardano.FixedTransactionBody.from_bytes(tx.body().to_bytes());
  const hex = Buffer.from(fixed.tx_hash().to_bytes()).toString('hex');
  if (typeof fixed.free === 'function') fixed.free();
  return hex;
};

export const emitUtxoChange = (data = {}) => {
  const message = {
    data,
    target: TARGET,
    sender: SENDER.extension,
    event: EVENT.utxoChange,
  };
  if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
    window.postMessage(message);
  }
  platform.events?.broadcastToTabs?.(message);
};

/**
 * Prepend a just-submitted hash and optional pending stub (kind labels).
 */
export const prependPendingHash = async (txHash, extra = []) => {
  if (!txHash || !TX_HASH_RE.test(txHash)) return;
  const hash = txHash.toLowerCase();
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  const slot = accounts?.[currentIndex]?.[network.id];
  if (!slot?.history) return;

  if (!Array.isArray(slot.history.confirmed)) slot.history.confirmed = [];
  if (!slot.history.details || typeof slot.history.details !== 'object') {
    slot.history.details = {};
  }
  if (!slot.history.confirmed.includes(hash)) {
    slot.history.confirmed.unshift(hash);
  }
  const existing = slot.history.details[hash];
  if (!existing || existing.pending) {
    slot.history.details[hash] = {
      pending: true,
      submittedAt: existing?.submittedAt || Date.now(),
      extra: Array.isArray(extra) ? extra : [],
    };
  }
  await setStorage({ [STORAGE.accounts]: { ...accounts } });
};

/**
 * Parse submitted CBOR, classify certs/votes, and record a pending history row.
 * Must not throw — submit already succeeded.
 */
export const recordSubmittedTx = async (txHex, submittedHash) => {
  let extra = [];
  let hash = normalizeSubmittedHash(submittedHash);
  try {
    if (txHex) {
      await Loader.load();
      extra = classifyCslTx(
        typeof Loader.Cardano.Transaction.from_hex === 'function'
          ? Loader.Cardano.Transaction.from_hex(txHex)
          : Loader.Cardano.Transaction.from_bytes(Buffer.from(txHex, 'hex'))
      );
      if (!hash) hash = hashFromTxHex(Loader.Cardano, txHex);
    }
  } catch (error) {
    console.warn(
      'Could not classify submitted transaction for history:',
      error?.message || error
    );
  }
  if (!hash) return;
  await prependPendingHash(hash, extra);
  emitUtxoChange({ txHash: hash });
};
