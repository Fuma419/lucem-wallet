/**
 * Shared exit/abort controls for full-page setup and signing flows.
 * Always-visible header Exit avoids trapping users mid-wizard.
 */
import React from 'react';
import { Box, Button, Image } from '@chakra-ui/react';
import platform from '../../../platform';

/**
 * Leave create/import/HW account setup without writing anything.
 * Returns to Accounts when a vault already has accounts; otherwise Welcome.
 */
export async function leaveSetupFlow() {
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
  const dest = hasAccounts ? '/accounts' : '/welcome';
  if (typeof platform.navigation.openMainRoute === 'function') {
    await platform.navigation.openMainRoute(dest);
  } else {
    await platform.navigation.closeCurrentTab();
  }
}

/** Leave a HW signing tab (Keystone / Trezor) and return to the main app. */
export async function leaveSignTabFlow() {
  if (typeof platform.navigation.openMainRoute === 'function') {
    await platform.navigation.openMainRoute('/wallet');
  } else {
    await platform.navigation.closeCurrentTab();
  }
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

const EXIT_BUTTON_PROPS = {
  type: 'button',
  variant: 'ghost',
  size: 'sm',
  color: 'whiteAlpha.800',
  fontWeight: 'medium',
  letterSpacing: '0.02em',
  _hover: { bg: 'whiteAlpha.100', color: 'white' },
  _active: { bg: 'whiteAlpha.200' },
  'data-testid': 'flow-exit-button',
};

/** Subtle ghost Exit — use under primary CTAs or in headers. */
export const FlowExitButton = ({ onClick, children = 'Exit', ...rest }) => (
  <Button {...EXIT_BUTTON_PROPS} onClick={onClick} {...rest}>
    {children}
  </Button>
);

/**
 * Full-page tab header: logo left, Exit right (always available).
 */
export const FlowShellHeader = ({
  logoSrc,
  onExit,
  hideLogoOnMobile = false,
  exitLabel = 'Exit',
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
    <FlowExitButton onClick={onExit} flexShrink={0}>
      {exitLabel}
    </FlowExitButton>
  </Box>
);
