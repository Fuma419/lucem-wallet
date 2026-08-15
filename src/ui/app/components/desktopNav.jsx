import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Button, Flex, Icon, Image, Stack, Text } from '@chakra-ui/react';
import {
  MdAccountBalanceWallet,
  MdHome,
  MdHowToVote,
  MdOutlineHowToReg,
  MdSend,
  MdSettings,
} from 'react-icons/md';
import AvatarLoader from './avatarLoader';
import { isSameAccountIndex } from '../utils/accountIndex';
import Logo from '../../../assets/img/logo.png';

const NAV_ITEMS = [
  { to: '/wallet', label: 'Wallet', icon: MdHome, testId: 'desktop-nav-wallet' },
  { to: '/send', label: 'Send', icon: MdSend, testId: 'desktop-nav-send' },
  {
    to: '/staking',
    label: 'Stake',
    icon: MdOutlineHowToReg,
    testId: 'desktop-nav-stake',
    stake: true,
  },
  {
    to: '/governance',
    label: 'Vote',
    icon: MdHowToVote,
    testId: 'desktop-nav-vote',
  },
  {
    to: '/accounts',
    label: 'Accounts',
    icon: MdAccountBalanceWallet,
    testId: 'desktop-nav-accounts',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: MdSettings,
    testId: 'desktop-nav-settings',
  },
];

const accountKeyFor = (accountInfo, fallbackKey) =>
  accountInfo && accountInfo.index != null ? accountInfo.index : fallbackKey;

/**
 * Persistent left sidebar for laptop / desktop web. Replaces corner FABs so
 * navigation stays next to the content instead of the viewport corners.
 */
const DesktopNav = ({
  accounts = {},
  currentAccountIndex = null,
  onAccountSelect,
  delegation = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const accountEntries = Object.keys(accounts || {}).map((key) => ({
    key,
    info: accounts[key],
  }));

  const go = (to) => {
    if (path !== to) navigate(to);
  };

  return (
    <Box
      as="nav"
      className="lucem-desktop-nav"
      aria-label="Wallet"
      data-testid="lucem-desktop-nav"
    >
      <Flex className="lucem-desktop-nav-brand" align="center" gap={3} mb={6}>
        <Image
          src={Logo}
          alt=""
          boxSize="2.25rem"
          objectFit="contain"
          flexShrink={0}
        />
        <Text className="lucem-desktop-nav-title">Lucem</Text>
      </Flex>

      <Stack spacing={1} mb={8}>
        {NAV_ITEMS.map((item) => {
          const label =
            item.stake && !delegation?.active ? 'Delegate' : item.label;
          const isActive = path === item.to;
          return (
            <Button
              key={item.to}
              className="lucem-desktop-nav-link"
              data-testid={item.testId}
              data-active={isActive ? 'true' : undefined}
              aria-current={isActive ? 'page' : undefined}
              variant="unstyled"
              height="auto"
              minH="2.75rem"
              px={3}
              display="flex"
              alignItems="center"
              justifyContent="flex-start"
              gap={3}
              onClick={() => go(item.to)}
            >
              <Icon as={item.icon} boxSize={5} />
              <Text as="span">{label}</Text>
            </Button>
          );
        })}
      </Stack>

      <Text className="lucem-desktop-nav-section">Accounts</Text>
      <Stack spacing={1} data-testid="desktop-nav-accounts-list">
        {accountEntries.map(({ key, info }) => {
          const switchKey = accountKeyFor(info, key);
          const isActive = isSameAccountIndex(currentAccountIndex, switchKey);
          const accountName = (info && info.name) || `Account ${key}`;
          return (
            <Button
              key={key}
              className="lucem-desktop-nav-account"
              data-testid={`desktop-nav-account-${key}`}
              data-active={isActive ? 'true' : undefined}
              aria-current={isActive ? 'true' : undefined}
              aria-label={
                isActive
                  ? `${accountName}, selected`
                  : `Switch to ${accountName}`
              }
              variant="unstyled"
              height="auto"
              minH="2.75rem"
              px={2}
              display="flex"
              alignItems="center"
              justifyContent="flex-start"
              gap={3}
              onClick={() => {
                if (!isActive) onAccountSelect?.(switchKey);
              }}
            >
              <Box
                boxSize="2rem"
                rounded="full"
                overflow="hidden"
                flexShrink={0}
              >
                <AvatarLoader avatar={info && info.avatar} width="100%" />
              </Box>
              <Text as="span" isTruncated>
                {accountName}
              </Text>
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
};

export default DesktopNav;
