/**
 * Glow preference: explicit on/off, otherwise theme default
 * (light = off, dark = on).
 *
 * Legacy storage wrote `true` as the implicit default; that is treated as
 * unset so light mode can start without neon. Explicit on is stored as `'on'`.
 */

export const GLOW_EFFECTS_ON = 'on';

/** @param {unknown} value */
export const parseStoredGlowEffects = (value) => {
  if (value === false) return false;
  if (value === GLOW_EFFECTS_ON) return true;
  return undefined;
};

/**
 * @param {boolean | undefined} stored
 * @param {string} [colorMode]
 */
export const resolveGlowEffects = (stored, colorMode) => {
  if (stored === false) return false;
  if (stored === true) return true;
  return colorMode !== 'light';
};

/** @param {boolean | undefined} stored */
export const glowEffectsDomValue = (stored) => {
  if (stored === false) return 'off';
  if (stored === true) return 'on';
  return 'auto';
};

/** @param {boolean} enabled */
export const storageValueForGlowEffects = (enabled) =>
  enabled ? GLOW_EFFECTS_ON : false;
