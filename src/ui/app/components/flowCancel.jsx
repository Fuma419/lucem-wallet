/**
 * Cancel / abort for full-page wallet create, import, and HW setup flows.
 * Cancel returns to the page that opened the flow via `?from=` when present.
 */
import React from 'react';
import { Box, Button, Image } from '@chakra-ui/react';
import platform from '../../../platform';

/** Main-app routes allowed as Cancel destinations / `?from=` values. */
export const FLOW_RETURN_ROUTES = [
  '/wallet',
  '/accounts',
  '/welcome',
  '/settings',
  '/staking',
  '/governance',
  '/send',
];

export function sanitizeFlowReturnPath(path) {
  if (!path || typeof path !== 'string') return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const bare = normalized.split('?')[0].split('#')[0];
  return FLOW_RETURN_ROUTES.includes(bare) ? bare : null;
}

/**
 * Append `from=<route>` so Cancel can return to the initiating page.
 * @param {string} query - existing query (`?type=generate` or `type=generate`)
 * @param {string} fromPath - current SPA route (e.g. `/accounts`)
 */
export function appendFlowReturnQuery(query = '', fromPath) {
  const safe = sanitizeFlowReturnPath(fromPath);
  if (!safe) {
    if (!query) return '';
    return query.startsWith('?') ? query : `?${query}`;
  }
  const raw = query.startsWith('?') ? query.slice(1) : query;
  const params = new URLSearchParams(raw);
  params.set('from', safe);
  return `?${params.toString()}`;
}

export function readFlowReturnPath(
  search = typeof window !== 'undefined' ? window.location.search : ''
) {
  try {
    return sanitizeFlowReturnPath(new URLSearchParams(search).get('from'));
  } catch {
    return null;
  }
}

async function openReturnRoute(path) {
  const safe = sanitizeFlowReturnPath(path) || '/wallet';
  if (typeof platform.navigation.openMainRoute === 'function') {
    await platform.navigation.openMainRoute(safe);
  } else {
    await platform.navigation.closeCurrentTab();
  }
}

/**
 * Leave create/import/HW account setup without writing anything.
 * Prefers `?from=` (initiator). Falls back to accounts vs welcome.
 */
export async function leaveSetupFlow() {
  const from = readFlowReturnPath();
  if (from) {
    await openReturnRoute(from);
    return;
  }
  let hasAccounts = false;
  try {
    const accounts = await platform.storage.get('accounts');
    hasAccounts =
      accounts != null &&
      typeof accounts === 'object' &&
      Object.keys(accounts).length > 0;
  } catch {
    hasAccounts = false;
  }
  await openReturnRoute(hasAccounts ? '/accounts' : '/welcome');
}

const CANCEL_BUTTON_PROPS = {
  type: 'button',
  variant: 'ghost',
  size: 'sm',
  color: 'whiteAlpha.800',
  fontWeight: 'medium',
  letterSpacing: '0.02em',
  _hover: { bg: 'whiteAlpha.100', color: 'white' },
  _active: { bg: 'whiteAlpha.200' },
  'data-testid': 'setup-cancel-button',
};

/** Ghost Cancel — header or under primary CTAs. */
export const SetupCancelButton = ({
  onClick,
  children = 'Cancel',
  ...rest
}) => (
  <Button {...CANCEL_BUTTON_PROPS} onClick={onClick} {...rest}>
    {children}
  </Button>
);

/**
 * Full-page tab header: logo left, Cancel right (always available).
 */
export const SetupShellHeader = ({
  logoSrc,
  onCancel,
  hideLogoOnMobile = false,
  cancelLabel = 'Cancel',
}) => (
  <Box
    as="header"
    width="100%"
    flexShrink={0}
    display="flex"
    alignItems="center"
    justifyContent="space-between"
    gap={3}
    pt={{
      base: hideLogoOnMobile
        ? 'max(0.35rem, env(safe-area-inset-top, 0px))'
        : 'max(1rem, env(safe-area-inset-top, 0px))',
      md: 8,
    }}
    pb={{ base: hideLogoOnMobile ? 0 : 2, md: 2 }}
    px={{ base: 4, md: 8 }}
  >
    <Box minW={0} flex="1">
      {logoSrc ? (
        <Image
          draggable={false}
          src={logoSrc}
          width={{ base: '72px', sm: '88px', md: '100px' }}
          maxW="min(100px, 36vw)"
          objectFit="contain"
          alt=""
          display={{
            base: hideLogoOnMobile ? 'none' : 'block',
            md: 'block',
          }}
        />
      ) : null}
    </Box>
    <SetupCancelButton onClick={onCancel} flexShrink={0}>
      {cancelLabel}
    </SetupCancelButton>
  </Box>
);
