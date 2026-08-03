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
  useColorMode,
  useColorModeValue,
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

const walletFabBase = {
  rounded: 'full',
  shadow: 'md',
  boxSize: { base: '12', sm: '13', md: '14' },
  minW: { base: '12', sm: '13', md: '14' },
  minH: { base: '12', sm: '13', md: '14' },
  p: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
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
 */
const WalletTrays = ({
  networkId,
  onNetworkSelect,
  isNetworkLoading = false,
  delegation = null,
  swapTrays = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode } = useColorMode();
  const [isTrayOpen, setIsTrayOpen] = React.useState(false);
  const [isNetworkTrayOpen, setIsNetworkTrayOpen] = React.useState(false);
  const traysSwapped = Boolean(swapTrays);

  const fabVoteClass = colorMode === 'dark' ? 'button fab-vote' : undefined;
  const fabStakeClass = colorMode === 'dark' ? 'button fab-stake' : undefined;
  const fabAccountsClass =
    colorMode === 'dark' ? 'button fab-accounts' : undefined;
  const fabSettingsClass =
    colorMode === 'dark' ? 'button fab-settings' : undefined;
  const fabToggleClass = colorMode === 'dark' ? 'button fab-toggle' : undefined;

  const fabVote = useColorModeValue(
    {
      bg: 'cyan.500',
      borderWidth: '2px',
      borderColor: 'cyan.700',
      _hover: { bg: 'cyan.600' },
    },
    {
      bg: 'cyan.700',
      borderWidth: '2px',
      borderColor: 'cyan.300',
      boxShadow: '0 0 14px rgba(0, 245, 255, 0.35)',
      _hover: { bg: 'cyan.600' },
    }
  );
  const fabStake = useColorModeValue(
    {
      bg: 'yellow.500',
      borderWidth: '2px',
      borderColor: 'yellow.700',
      _hover: { bg: 'yellow.600' },
    },
    {
      bg: 'yellow.600',
      borderWidth: '2px',
      borderColor: 'yellow.400',
      boxShadow: '0 0 14px rgba(206, 250, 0, 0.35)',
      _hover: { bg: 'yellow.500' },
    }
  );
  const fabAccounts = useColorModeValue(
    {
      bg: 'orange.500',
      borderWidth: '2px',
      borderColor: 'orange.700',
      _hover: { bg: 'orange.600' },
    },
    {
      bg: 'orange.600',
      borderWidth: '2px',
      borderColor: 'orange.300',
      boxShadow: '0 0 14px rgba(255, 140, 0, 0.35)',
      _hover: { bg: 'orange.500' },
    }
  );
  const fabSettings = useColorModeValue(
    {
      bg: 'purple.500',
      borderWidth: '2px',
      borderColor: 'purple.700',
      _hover: { bg: 'purple.600' },
    },
    {
      bg: 'purple.600',
      borderWidth: '2px',
      borderColor: 'purple.300',
      boxShadow: '0 0 14px rgba(220, 27, 250, 0.35)',
      _hover: { bg: 'purple.500' },
    }
  );
  const fabToggle = useColorModeValue(
    {
      bg: 'blue.500',
      borderWidth: '2px',
      borderColor: 'blue.700',
      _hover: { bg: 'blue.600' },
    },
    {
      bg: 'blue.600',
      borderWidth: '2px',
      borderColor: 'blue.300',
      boxShadow: '0 0 14px rgba(0, 122, 255, 0.35)',
      _hover: { bg: 'blue.500' },
    }
  );

  const fabColor = colorMode === 'dark' ? 'white' : 'black';
  const floatingVoteProps = { ...walletFabBase, color: fabColor, ...fabVote };
  const floatingStakeProps = { ...walletFabBase, color: fabColor, ...fabStake };
  const floatingAccountsProps = {
    ...walletFabBase,
    color: fabColor,
    ...fabAccounts,
  };
  const floatingSettingsProps = {
    ...walletFabBase,
    color: fabColor,
    ...fabSettings,
  };
  const floatingToggleProps = { ...walletFabBase, color: fabColor, ...fabToggle };
  const floatingNetworkToggleProps = {
    ...walletFabBase,
    color: fabColor,
    ...fabSettings,
  };

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
                color="white"
                data-active={
                  networkId === networkOption.id ? 'true' : undefined
                }
                className={`button network-${networkOption.id} ${
                  isNetworkLoading && networkId === networkOption.id
                    ? 'is-loading'
                    : ''
                }`}
                shadow="none"
                flexShrink={0}
                variant="unstyled"
                aria-label={`Switch to ${networkOption.label}`}
                onClick={() => {
                  if (networkId !== networkOption.id) {
                    onNetworkSelect?.(networkOption.id);
                  }
                  setIsNetworkTrayOpen(false);
                }}
              >
                <Icon as={networkOption.icon} boxSize={6} />
              </TrayLabeledButton>
            ))}
          </Stack>
        </Collapse>
        <Button
          {...floatingNetworkToggleProps}
          className={fabSettingsClass}
          onClick={() => setIsNetworkTrayOpen(!isNetworkTrayOpen)}
          aria-label="Toggle network menu"
        >
          <Icon
            as={isNetworkTrayOpen ? ChevronDownIcon : ChevronUpIcon}
            boxSize={8}
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
            {delegation && (
              <Box data-testid="wallet-delegation" sx={{ display: 'contents' }}>
                <TrayLabeledButton
                  label="Vote"
                  labelSide={actionLabelSide}
                  {...floatingVoteProps}
                  className={fabVoteClass}
                  data-active={path === '/governance' ? 'true' : undefined}
                  onClick={() => go('/governance')}
                  aria-label="Open voting"
                >
                  <Icon as={MdHowToVote} boxSize={6} />
                </TrayLabeledButton>
                <TrayLabeledButton
                  label={delegation.active ? 'Stake' : 'Delegate'}
                  labelSide={actionLabelSide}
                  {...floatingStakeProps}
                  className={fabStakeClass}
                  data-active={path === '/staking' ? 'true' : undefined}
                  onClick={() => go('/staking')}
                  aria-label="Open stake center"
                >
                  <Icon as={MdOutlineHowToReg} boxSize={6} />
                </TrayLabeledButton>
              </Box>
            )}

            <TrayLabeledButton
              label="Accounts"
              labelSide={actionLabelSide}
              {...floatingAccountsProps}
              className={fabAccountsClass}
              data-active={path === '/accounts' ? 'true' : undefined}
              onClick={() => go('/accounts')}
              aria-label="Open accounts"
            >
              <Icon as={MdAccountBalanceWallet} boxSize={6} />
            </TrayLabeledButton>

            <TrayLabeledButton
              label="Settings"
              labelSide={actionLabelSide}
              {...floatingSettingsProps}
              className={fabSettingsClass}
              data-active={path === '/settings' ? 'true' : undefined}
              onClick={() => go('/settings')}
              aria-label="Open settings"
            >
              <SettingsIcon boxSize={6} />
            </TrayLabeledButton>
          </Stack>
        </Collapse>
        {isOnNavPage ? (
          <Button
            {...floatingToggleProps}
            className={fabToggleClass}
            onClick={() => go('/wallet')}
            aria-label="Go to wallet home"
            data-testid="wallet-home-fab"
          >
            <Icon as={MdHome} boxSize={7} />
          </Button>
        ) : (
          <Button
            {...floatingToggleProps}
            className={fabToggleClass}
            onClick={() => setIsTrayOpen(!isTrayOpen)}
            aria-label="Toggle action menu"
          >
            <Icon
              as={isTrayOpen ? ChevronDownIcon : ChevronUpIcon}
              boxSize={8}
            />
          </Button>
        )}
      </Box>
    </>
  );
};

export default WalletTrays;
