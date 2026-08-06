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
 * Stop iOS Safari / Keychain Face ID from treating Exit as a login attempt.
 * Blur focus and neutralize password / username-like fields before navigation.
 */
export function scrubSensitiveFormFields(root) {
  if (typeof document === 'undefined') return;
  try {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
  } catch {
    /* ignore */
  }

  const scope =
    root ||
    document.querySelector('.create-wallet-modal') ||
    document.querySelector('.lucem-modal-card') ||
    document;

  let nodes;
  try {
    nodes = scope.querySelectorAll(
      [
        'input[type="password"]',
        'input[autocomplete="username"]',
        'input[autocomplete="current-password"]',
        'input[autocomplete="new-password"]',
        'input[name="username"]',
        'input[name="new-password"]',
        'input[name="confirm-new-password"]',
        'input[name="password"]',
        'input[name="lucem-account-name"]',
        'input[name="lucem-account-password"]',
        'input[name="lucem-account-password-confirm"]',
        'input[name="lucem-hw-local-password"]',
        'input[name="lucem-hw-local-password-confirm"]',
        '#lucem-account-password',
        '#lucem-account-password-confirm',
        '#lucem-account-name',
      ].join(', ')
    );
  } catch {
    return;
  }

  nodes.forEach((el) => {
    try {
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('readonly', 'readonly');
      el.removeAttribute('name');
      el.value = '';
      if (el.getAttribute('type') === 'password') {
        el.setAttribute('type', 'text');
      }
      el.disabled = true;
    } catch {
      /* ignore */
    }
  });
}

/**
 * Leave create/import/HW account setup without writing anything.
 * Prefers `?from=` (initiator). Falls back to accounts vs welcome.
 */
export async function leaveSetupFlow() {
  scrubSensitiveFormFields();
  // Give WebKit time to drop the Keychain / Face ID autofill session.
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    } else {
      setTimeout(resolve, 50);
    }
  });
  scrubSensitiveFormFields();

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
    // Scrub before any async leave* work so Face ID never sees a live password field.
    scrubSensitiveFormFields();
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
