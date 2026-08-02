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
  MdHowToVote,
  MdOutlineHowToReg,
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

/** Icon FAB with a visible text descriptor to its left (right tray). */
const TrayActionButton = ({ label, children, ...buttonProps }) => (
  <Flex alignItems="center" justifyContent="flex-end" gap={2} w="100%">
    <Text {...trayActionLabelProps}>{label}</Text>
    <Button {...buttonProps}>{children}</Button>
  </Flex>
);

const networkOptions = [
  { id: NETWORK_ID.mainnet, label: 'Mainnet' },
  { id: NETWORK_ID.preprod, label: 'Preprod' },
  { id: NETWORK_ID.preview, label: 'Preview' },
];

/**
 * Fixed lower-left (network) and lower-right (actions) trays shared by wallet
 * shell screens. Navigation FABs switch between /accounts, /settings,
 * /staking, and /governance; Back/Wallet on those pages returns home.
 */
const WalletTrays = ({
  networkId,
  onNetworkSelect,
  isNetworkLoading = false,
  delegation = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { colorMode } = useColorMode();
  const [isTrayOpen, setIsTrayOpen] = React.useState(false);
  const [isNetworkTrayOpen, setIsNetworkTrayOpen] = React.useState(false);

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

      {/* Lower left tray — network switcher with collapse toggle */}
      <Box
        zIndex={4}
        position="fixed"
        bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
        left="calc(env(safe-area-inset-left, 0px) + 1.5rem)"
        display="flex"
        flexDirection="column"
        alignItems="flex-start"
        justifyContent="flex-end"
        gap={2}
        data-testid="wallet-network-tray"
      >
        <Collapse
          in={isNetworkTrayOpen}
          animateOpacity
          style={{ overflow: 'visible' }}
        >
          <Stack spacing={2} mb={2} alignItems="stretch">
            {networkOptions.map((networkOption) => (
              <Button
                key={networkOption.id}
                w="128px"
                h="40px"
                data-active={
                  networkId === networkOption.id ? 'true' : undefined
                }
                className={`button network-${networkOption.id} ${
                  isNetworkLoading && networkId === networkOption.id
                    ? 'is-loading'
                    : ''
                }`}
                size="sm"
                rounded="lg"
                shadow="none"
                flexShrink={0}
                variant="unstyled"
                onClick={() => {
                  if (networkId !== networkOption.id) {
                    onNetworkSelect?.(networkOption.id);
                  }
                  setIsNetworkTrayOpen(false);
                }}
              >
                {networkOption.label}
              </Button>
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

      {/* Lower right tray — respect safe area on notched devices */}
      <Box
        zIndex={4}
        position="fixed"
        bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
        right="calc(env(safe-area-inset-right, 0px) + 1.5rem)"
        display="flex"
        flexDirection="column"
        alignItems="flex-end"
        justifyContent="flex-end"
        gap={2}
        data-testid="wallet-action-tray"
      >
        <Collapse in={isTrayOpen} animateOpacity style={{ overflow: 'visible' }}>
          <Stack spacing={2} mb={2} alignItems="stretch">
            {delegation && (
              <Stack
                data-testid="wallet-delegation"
                spacing={2}
                alignItems="stretch"
              >
                <TrayActionButton
                  label="Vote"
                  {...floatingVoteProps}
                  className={fabVoteClass}
                  data-active={path === '/governance' ? 'true' : undefined}
                  onClick={() => go('/governance')}
                  aria-label="Open voting"
                >
                  <Icon as={MdHowToVote} boxSize={6} />
                </TrayActionButton>
                <TrayActionButton
                  label={delegation.active ? 'Stake' : 'Delegate'}
                  {...floatingStakeProps}
                  className={fabStakeClass}
                  data-active={path === '/staking' ? 'true' : undefined}
                  onClick={() => go('/staking')}
                  aria-label="Open stake center"
                >
                  <Icon as={MdOutlineHowToReg} boxSize={6} />
                </TrayActionButton>
              </Stack>
            )}

            <TrayActionButton
              label="Accounts"
              {...floatingAccountsProps}
              className={fabAccountsClass}
              data-active={path === '/accounts' ? 'true' : undefined}
              onClick={() => go('/accounts')}
              aria-label="Open accounts"
            >
              <Icon as={MdAccountBalanceWallet} boxSize={6} />
            </TrayActionButton>

            <TrayActionButton
              label="Settings"
              {...floatingSettingsProps}
              className={fabSettingsClass}
              data-active={path === '/settings' ? 'true' : undefined}
              onClick={() => go('/settings')}
              aria-label="Open settings"
            >
              <SettingsIcon boxSize={6} />
            </TrayActionButton>
          </Stack>
        </Collapse>
        <Button
          {...floatingToggleProps}
          className={fabToggleClass}
          onClick={() => setIsTrayOpen(!isTrayOpen)}
          aria-label="Toggle action menu"
        >
          <Icon as={isTrayOpen ? ChevronDownIcon : ChevronUpIcon} boxSize={8} />
        </Button>
      </Box>
    </>
  );
};

export default WalletTrays;
