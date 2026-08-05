/**
 * Shared exit/abort controls for full-page setup and signing flows.
 * Close control matches Chakra modal chrome (icon X on the card).
 * Exit returns to the page that opened the flow (`from` query), when present.
 */
import React from 'react';
import { Box, IconButton, Image } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import platform from '../../../platform';

/** Main-app routes allowed as Exit destinations / `?from=` values. */
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
 * Append `from=<route>` so Exit can return to the initiating page.
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

/** @deprecated Prefer appendFlowReturnQuery */
export const withFlowReturnQuery = appendFlowReturnQuery;

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
 * Leave a HW signing tab (Keystone / Trezor). Prefers `?from=` (e.g. /send).
 */
export async function leaveSignTabFlow(fallback = '/wallet') {
  const from = readFlowReturnPath() || sanitizeFlowReturnPath(fallback) || '/wallet';
  await openReturnRoute(from);
}

/**
 * Decline a dApp request (when provided) then close the approval popup/tab.
 * Prefer platform navigation over `window.close()` (blocked on many web/extension tabs).
 */
export async function leaveDappApprovalFlow(decline) {
  try {
    if (typeof decline === 'function') await decline();
  } catch {
    /* still leave the flow */
  }
  if (typeof platform.navigation.closeCurrentTab === 'function') {
    await platform.navigation.closeCurrentTab();
    return;
  }
  if (typeof window !== 'undefined' && typeof window.close === 'function') {
    window.close();
  }
}

function handleExitClick(onClick) {
  return (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof onClick === 'function') onClick(e);
  };
}

/**
 * Modal-style close (X) for full-page flow cards. Never submits enclosing forms.
 */
export const FlowCardCloseButton = ({ onClick, ...rest }) => (
  <IconButton
    type="button"
    aria-label="Exit"
    icon={<CloseIcon boxSize="2.5" />}
    size="sm"
    variant="ghost"
    color="whiteAlpha.700"
    position="absolute"
    top={{ base: 3, md: 4 }}
    right={{ base: 3, md: 4 }}
    zIndex={2}
    minW="36px"
    h="36px"
    rounded="full"
    _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
    _active={{ bg: 'whiteAlpha.300' }}
    onClick={handleExitClick(onClick)}
    data-testid="flow-exit-button"
    {...rest}
  />
);

/** @deprecated Use FlowCardCloseButton on the modal card instead. */
export const FlowExitButton = ({ onClick, children = 'Exit', ...rest }) => (
  <IconButton
    type="button"
    aria-label={typeof children === 'string' ? children : 'Exit'}
    icon={<CloseIcon boxSize="2.5" />}
    size="sm"
    variant="ghost"
    color="whiteAlpha.700"
    rounded="full"
    _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
    onClick={handleExitClick(onClick)}
    data-testid="flow-exit-button"
    {...rest}
  />
);

/**
 * Full-page tab header: logo only (close control lives on the modal card).
 */
export const FlowShellHeader = ({
  logoSrc,
  hideLogoOnMobile = false,
}) => (
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
