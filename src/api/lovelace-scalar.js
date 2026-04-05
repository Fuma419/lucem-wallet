/**
 * Normalize Cardano lovelace-like values from storage, Koios, or CSL wrappers
 * to a decimal digit string. Prevents `BigInt([object Object])` crashes in the UI
 * when a field is an unexpected shape.
 */
export function normalizeLovelaceScalar(value) {
  if (value == null) return '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    return String(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const t = value.trim().replace(/[,_\s]/g, '');
    if (t === '' || t === 'null' || t === 'undefined') return '0';
    return t;
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
      return normalizeLovelaceScalar(value.ada_lovelace);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'quantity')) {
      return normalizeLovelaceScalar(value.quantity);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'lovelace')) {
      return normalizeLovelaceScalar(value.lovelace);
    }
  }
  return '0';
}

/** BigInt lovelace amount; returns 0n if the value cannot be parsed. */
export function bigIntLovelace(value) {
  const s = normalizeLovelaceScalar(value);
  if (s === '' || !/^\d+$/.test(s)) return 0n;
  try {
    return BigInt(s);
  } catch (_) {
    return 0n;
  }
}
