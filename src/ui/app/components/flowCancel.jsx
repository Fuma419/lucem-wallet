/**
 * Cancel / abort for full-page wallet create, import, and HW setup flows.
 * Cancel returns to the page that opened the flow via `?from=` when present.
 */
import React from 'react';
import { Box, Button, IconButton, Image } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
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

/**
 * Quiet Cancel under primary neon CTAs — matches welcome-modal Close
 * (ghost, not a second neon outline that competes with Continue).
 * `tone` kept for API compatibility with call sites.
 */
export const SetupCancelButton = ({
  onClick,
  children = 'Cancel',
  tone: _tone = 'purple',
  ...rest
}) => (
  <Button
    type="button"
    variant="ghost"
    size="md"
    w="100%"
    maxW="300px"
    minH="44px"
    rounded="lg"
    fontWeight="medium"
    letterSpacing="0.06em"
    textTransform="uppercase"
    fontFamily="'Barlow', sans-serif"
    color="whiteAlpha.700"
    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
    _active={{ bg: 'whiteAlpha.200' }}
    data-testid="setup-cancel-button"
    onClick={onClick}
    {...rest}
  >
    {children}
  </Button>
);

/**
 * Modal-style close control on the glowing setup card (matches welcome modals).
 */
export const SetupCardCloseButton = ({ onCancel, ...rest }) => (
  <IconButton
    type="button"
    aria-label="Cancel"
    data-testid="setup-card-close"
    icon={<CloseIcon boxSize={2.5} />}
    size="sm"
    variant="ghost"
    color="whiteAlpha.700"
    position="absolute"
    top={3}
    right={3}
    zIndex={2}
    rounded="md"
    _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
    _active={{ bg: 'whiteAlpha.200' }}
    onClick={onCancel}
    {...rest}
  />
);

/** Logo-only header for full-page setup tabs (Cancel lives on the card). */
export const SetupShellHeader = ({ logoSrc, hideLogoOnMobile = false }) => (
  <Box
    as="header"
    width="100%"
    flexShrink={0}
    display="flex"
    alignItems="center"
    justifyContent="flex-start"
    pt={{
      base: hideLogoOnMobile
        ? 'max(0.35rem, env(safe-area-inset-top, 0px))'
        : 'max(1rem, env(safe-area-inset-top, 0px))',
      md: 8,
    }}
    pb={{ base: hideLogoOnMobile ? 0 : 2, md: 2 }}
    px={{ base: 4, md: 8 }}
  >
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
);
