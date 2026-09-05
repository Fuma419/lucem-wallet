import {
  GLOW_EFFECTS_ON,
  glowEffectsDomValue,
  parseStoredGlowEffects,
  resolveGlowEffects,
  storageValueForGlowEffects,
} from '../../../../api/extension/glow-effects';

describe('glow effects preference', () => {
  test('legacy true and unset are auto (not an explicit on)', () => {
    expect(parseStoredGlowEffects(undefined)).toBeUndefined();
    expect(parseStoredGlowEffects(true)).toBeUndefined();
    expect(parseStoredGlowEffects('on')).toBe(true);
    expect(parseStoredGlowEffects(false)).toBe(false);
  });

  test('light mode defaults off; dark stays on unless explicitly off', () => {
    expect(resolveGlowEffects(undefined, 'light')).toBe(false);
    expect(resolveGlowEffects(undefined, 'dark')).toBe(true);
    expect(resolveGlowEffects(false, 'light')).toBe(false);
    expect(resolveGlowEffects(false, 'dark')).toBe(false);
    expect(resolveGlowEffects(true, 'light')).toBe(true);
    expect(resolveGlowEffects(true, 'dark')).toBe(true);
  });

  test('DOM uses auto until the user opts in or out', () => {
    expect(glowEffectsDomValue(undefined)).toBe('auto');
    expect(glowEffectsDomValue(false)).toBe('off');
    expect(glowEffectsDomValue(true)).toBe('on');
    expect(storageValueForGlowEffects(true)).toBe(GLOW_EFFECTS_ON);
    expect(storageValueForGlowEffects(false)).toBe(false);
  });
});
