import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Collapse,
  Flex,
  Icon,
  Stack,
  Text,
} from '@chakra-ui/react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SettingsIcon,
} from '@chakra-ui/icons';
import {
  MdAccountBalanceWallet,
  MdHome,
  MdHowToVote,
  MdOutlineHowToReg,
  MdPublic,
  MdScience,
  MdVisibility,
} from 'react-icons/md';
import { NETWORK_ID } from '../../../config/config';

/**
 * Shared circular FAB chrome. Visual color / glow come from CSS `.button.fab-*`
 * (and `html[data-glow]`); keep Chakra props theme-agnostic so icons stay
 * white in light/dark and glow on/off.
 */
const walletFabBase = {
  rounded: 'full',
  shadow: 'none',
  boxSize: { base: '12', sm: '13', md: '14' },
  minW: { base: '12', sm: '13', md: '14' },
  minH: { base: '12', sm: '13', md: '14' },
  p: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  variant: 'unstyled',
  flexShrink: 0,
};

const trayActionLabelProps = {
  as: 'span',
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'white',
  opacity: 0.92,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  pointerEvents: 'none',
};

/** Icon FAB with a text descriptor on either side (flips when trays swap). */
const TrayLabeledButton = ({
  label,
  labelSide = 'left',
  children,
  ...buttonProps
}) => (
  <Flex
    className="lucem-tray-action-row"
    alignItems="center"
    justifyContent={labelSide === 'left' ? 'flex-end' : 'flex-start'}
    gap={2}
    w={labelSide === 'right' ? '100%' : undefined}
  >
    {labelSide === 'left' ? (
      <Text className="lucem-tray-action-label" {...trayActionLabelProps}>
        {label}
      </Text>
    ) : null}
    <Button {...buttonProps}>{children}</Button>
    {labelSide === 'right' ? (
      <Text className="lucem-tray-action-label" {...trayActionLabelProps}>
        {label}
      </Text>
    ) : null}
  </Flex>
);

const networkOptions = [
  { id: NETWORK_ID.mainnet, label: 'Mainnet', icon: MdPublic },
  { id: NETWORK_ID.preprod, label: 'Preprod', icon: MdScience },
  { id: NETWORK_ID.preview, label: 'Preview', icon: MdVisibility },
];

/**
 * Fixed bottom trays shared by wallet shell screens. Default: network left,
 * actions right. When `swapTrays` is true the sides are reversed.
 *
 * Glow on/off is owned by `html[data-glow]` + CSS (same as network FABs).
 * `glowEffects` is accepted for API compatibility with WalletShell.
 */
const WalletTrays = ({
  networkId,
  onNetworkSelect,
  isNetworkLoading = false,
  delegation = null,
  swapTrays = false,
  glowEffects: _glowEffects = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isTrayOpen, setIsTrayOpen] = React.useState(false);
  const [isNetworkTrayOpen, setIsNetworkTrayOpen] = React.useState(false);
  const traysSwapped = Boolean(swapTrays);

  const path = location.pathname;
  const go = (to) => {
    setIsTrayOpen(false);
    if (path !== to) navigate(to);
  };

  // On the tray's destination pages the toggle becomes a Home button that
  // returns to the wallet, so per-page back arrows are no longer needed.
  const navPaths = ['/accounts', '/settings', '/staking', '/governance'];
  const isOnNavPage = navPaths.includes(path);

  const sideInset = {
    left: 'calc(env(safe-area-inset-left, 0px) + 1.5rem)',
    right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
  };
  const networkSideProps = traysSwapped
    ? { right: sideInset.right, alignItems: 'flex-end' }
    : { left: sideInset.left, alignItems: 'flex-start' };
  const actionSideProps = traysSwapped
    ? { left: sideInset.left, alignItems: 'flex-start' }
    : { right: sideInset.right, alignItems: 'flex-end' };
  // Labels sit toward screen center (outside the icon relative to the edge).
  const networkLabelSide = traysSwapped ? 'left' : 'right';
  const actionLabelSide = traysSwapped ? 'right' : 'left';
  const networkMenuClass = traysSwapped
    ? 'lucem-tray-equal-actions'
    : 'lucem-tray-equal-actions is-start';
  const actionMenuClass = traysSwapped
    ? 'lucem-tray-equal-actions is-start'
    : 'lucem-tray-equal-actions';

  return (
    <>
      {isNetworkTrayOpen || isTrayOpen ? (
        <Box
          position="fixed"
          inset={0}
          zIndex={3}
          bg="blackAlpha.700"
          onClick={() => {
            setIsNetworkTrayOpen(false);
            setIsTrayOpen(false);
          }}
          aria-hidden="true"
          data-testid="wallet-tray-backdrop"
        />
      ) : null}

      <Box
        zIndex={4}
        position="fixed"
        bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
        display="flex"
        flexDirection="column"
        justifyContent="flex-end"
        gap={2}
        data-testid="wallet-network-tray"
        data-tray-side={traysSwapped ? 'right' : 'left'}
        {...networkSideProps}
      >
        <Collapse
          in={isNetworkTrayOpen}
          animateOpacity
          style={{ overflow: 'visible' }}
        >
          <Stack spacing={2} mb={2} alignItems="stretch" className={networkMenuClass}>
            {networkOptions.map((networkOption) => (
              <TrayLabeledButton
                key={networkOption.id}
                label={networkOption.label}
                labelSide={networkLabelSide}
                {...walletFabBase}
                data-active={
                  networkId === networkOption.id ? 'true' : undefined
                }
                className={`button network-${networkOption.id} ${
                  isNetworkLoading && networkId === networkOption.id
                    ? 'is-loading'
                    : ''
                }`}
                aria-label={`Switch to ${networkOption.label}`}
                onClick={() => {
                  if (networkId !== networkOption.id) {
                    onNetworkSelect?.(networkOption.id);
                  }
                  setIsNetworkTrayOpen(false);
                }}
              >
                <Icon as={networkOption.icon} boxSize={6} color="white" />
              </TrayLabeledButton>
            ))}
          </Stack>
        </Collapse>
        <Button
          {...walletFabBase}
          className="button fab-settings"
          onClick={() => setIsNetworkTrayOpen(!isNetworkTrayOpen)}
          aria-label="Toggle network menu"
        >
          <Icon
            as={isNetworkTrayOpen ? ChevronDownIcon : ChevronUpIcon}
            boxSize={8}
            color="white"
          />
        </Button>
      </Box>

      <Box
        zIndex={4}
        position="fixed"
        bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
        display="flex"
        flexDirection="column"
        justifyContent="flex-end"
        gap={2}
        data-testid="wallet-action-tray"
        data-tray-side={traysSwapped ? 'left' : 'right'}
        {...actionSideProps}
      >
        <Collapse in={isTrayOpen} animateOpacity style={{ overflow: 'visible' }}>
          <Stack
            spacing={2}
            mb={2}
            className={actionMenuClass}
            data-testid="wallet-action-tray-menu"
          >
            <TrayLabeledButton
              label="Vote"
              labelSide={actionLabelSide}
              {...walletFabBase}
              className="button fab-vote"
              data-testid="wallet-delegation"
              data-active={path === '/governance' ? 'true' : undefined}
              onClick={() => go('/governance')}
              aria-label="Open voting"
            >
              <Icon as={MdHowToVote} boxSize={6} color="white" />
            </TrayLabeledButton>
            <TrayLabeledButton
              label={delegation?.active ? 'Stake' : 'Delegate'}
              labelSide={actionLabelSide}
              {...walletFabBase}
              className="button fab-stake"
              data-active={path === '/staking' ? 'true' : undefined}
              onClick={() => go('/staking')}
              aria-label="Open stake center"
            >
              <Icon as={MdOutlineHowToReg} boxSize={6} color="white" />
            </TrayLabeledButton>

            <TrayLabeledButton
              label="Accounts"
              labelSide={actionLabelSide}
              {...walletFabBase}
              className="button fab-accounts"
              data-active={path === '/accounts' ? 'true' : undefined}
              onClick={() => go('/accounts')}
              aria-label="Open accounts"
            >
              <Icon as={MdAccountBalanceWallet} boxSize={6} color="white" />
            </TrayLabeledButton>

            <TrayLabeledButton
              label="Settings"
              labelSide={actionLabelSide}
              {...walletFabBase}
              className="button fab-settings"
              data-active={path === '/settings' ? 'true' : undefined}
              onClick={() => go('/settings')}
              aria-label="Open settings"
            >
              <SettingsIcon boxSize={6} color="white" />
            </TrayLabeledButton>
          </Stack>
        </Collapse>
        {isOnNavPage ? (
          <Button
            {...walletFabBase}
            className="button fab-toggle"
            onClick={() => go('/wallet')}
            aria-label="Go to wallet home"
            data-testid="wallet-home-fab"
          >
            <Icon as={MdHome} boxSize={7} color="white" />
          </Button>
        ) : (
          <Button
            {...walletFabBase}
            className="button fab-toggle"
            onClick={() => setIsTrayOpen(!isTrayOpen)}
            aria-label="Toggle action menu"
          >
            <Icon
              as={isTrayOpen ? ChevronDownIcon : ChevronUpIcon}
              boxSize={8}
              color="white"
            />
          </Button>
        )}
      </Box>
    </>
  );
};

export default WalletTrays;
