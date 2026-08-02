/**
 * Account map keys from Object.keys are always strings, while native
 * `account.index` is a number and HW indexes are strings. Storage may hold
 * either shape after switchAccount — compare as strings so any of N accounts
 * can highlight as selected.
 */
export const isSameAccountIndex = (a, b) =>
  a != null && b != null && String(a) === String(b);
