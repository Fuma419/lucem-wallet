import React from 'react';
import { useColorMode } from '@chakra-ui/react';
import {
  getStoredAppearancePreference,
  persistAppearancePreference,
} from './colorModePersistence';

function resolveSystemColorMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** @param {'light' | 'dark' | 'system'} appearance */
function resolveChakraMode(appearance) {
  if (appearance === 'system') return resolveSystemColorMode();
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return 'dark';
}

const AppearancePreferenceContext = React.createContext(null);

export function AppearancePreferenceProvider({ children }) {
  const { setColorMode } = useColorMode();
  const [appearance, setAppearanceState] = React.useState('dark');
  const appearanceRef = React.useRef('dark');

  React.useEffect(() => {
    appearanceRef.current = appearance;
  }, [appearance]);

  const applyAppearance = React.useCallback(
    (next) => {
      setColorMode(resolveChakraMode(next));
    },
    [setColorMode]
  );

  const setAppearance = React.useCallback(
    (next) => {
      setAppearanceState(next);
      appearanceRef.current = next;
      void persistAppearancePreference(next).catch(() => {});
      applyAppearance(next);
    },
    [applyAppearance]
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let stored = await getStoredAppearancePreference();
        let ls = '';
        try {
          ls = localStorage.getItem('chakra-ui-color-mode') || '';
        } catch (_) {
          /* ignore */
        }
        if (
          !stored &&
          (ls === 'light' || ls === 'dark' || ls === 'system')
        ) {
          stored = ls;
          void persistAppearancePreference(ls).catch(() => {});
        }
        if (cancelled) return;
        const pref = stored || 'dark';
        setAppearanceState(pref);
        appearanceRef.current = pref;
        applyAppearance(pref);
      } catch (_) {
        if (!cancelled) {
          setAppearanceState('dark');
          appearanceRef.current = 'dark';
          applyAppearance('dark');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyAppearance]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (appearanceRef.current !== 'system') return;
      setColorMode(mql.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [setColorMode]);

  const value = React.useMemo(
    () => ({ appearance, setAppearance }),
    [appearance, setAppearance]
  );

  return (
    <AppearancePreferenceContext.Provider value={value}>
      {children}
    </AppearancePreferenceContext.Provider>
  );
}

/**
 * @returns {{ appearance: 'light' | 'dark' | 'system', setAppearance: (v: 'light' | 'dark' | 'system') => void }}
 */
export function useAppearancePreference() {
  const ctx = React.useContext(AppearancePreferenceContext);
  if (!ctx) {
    return {
      appearance: 'dark',
      setAppearance: () => {},
    };
  }
  return ctx;
}
