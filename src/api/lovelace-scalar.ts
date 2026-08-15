/**
 * Normalize Cardano lovelace-like values from storage, Koios, or CSL wrappers
 * to a decimal digit string. Prevents `BigInt([object Object])` crashes in the UI
 * when a field is an unexpected shape.
 */

import { asLovelace, type Lovelace } from './types';

type LovelaceLike =
  | null
  | undefined
  | string
  | number
  | bigint
  | { to_str?: () => string; ada_lovelace?: unknown; quantity?: unknown; lovelace?: unknown };

export function normalizeLovelaceScalar(value: LovelaceLike): Lovelace {
  if (value == null) return asLovelace('0');
  if (typeof value === 'bigint') return asLovelace(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return asLovelace('0');
    return asLovelace(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const t = value.trim().replace(/[,_\s]/g, '');
    if (t === '' || t === 'null' || t === 'undefined') return asLovelace('0');
    return (/^\d+$/.test(t) ? asLovelace(t) : t) as Lovelace;
  }
  if (typeof value === 'object') {
    if (typeof value.to_str === 'function') {
      try {
        return normalizeLovelaceScalar(value.to_str());
      } catch (_) {
        /* fall through */
      }
    }
    if (Object.prototype.hasOwnProperty.call(value, 'ada_lovelace')) {
      return normalizeLovelaceScalar(value.ada_lovelace as LovelaceLike);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'quantity')) {
      return normalizeLovelaceScalar(value.quantity as LovelaceLike);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'lovelace')) {
      return normalizeLovelaceScalar(value.lovelace as LovelaceLike);
    }
  }
  return asLovelace('0');
}

/** BigInt lovelace amount; returns 0n if the value cannot be parsed. */
export function bigIntLovelace(value: LovelaceLike): bigint {
  const s = normalizeLovelaceScalar(value);
  if (s === '' || !/^\d+$/.test(s)) return BigInt(0);
  try {
    return BigInt(s);
  } catch (_) {
    return BigInt(0);
  }
}
