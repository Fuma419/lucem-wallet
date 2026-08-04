import {
  Box,
  Button,
  IconButton,
  Text,
  Switch as ButtonSwitch,
  Image,
  SkeletonCircle,
  Spinner,
  Checkbox,
  Input,
  useToast,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useColorModeValue,
  Stack,
} from '@chakra-ui/react';
import { useAppearancePreference } from '../../appearanceContext';
import { SmallCloseIcon, RepeatIcon } from '@chakra-ui/icons';
import React from 'react';
import platform from '../../../platform';
import {
  getCurrentAccount,
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  getWhitelisted,
  removeWhitelisted,
  eraseLocalWalletData,
  setAccountAvatar,
  setStorage,
} from '../../../api/extension';
import { useNavigate } from 'react-router-dom';
import { STORAGE } from '../../../config/config';
import { useStoreState, useStoreActions } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { ChangePasswordModal } from '../components/changePasswordModal';
import { LegalSettings } from '../../../features/settings/legal/LegalSettings';
import MultiAddressSettings from '../components/multiAddressSettings';
import { AboutContent } from '../components/about';
import useSurfaceColors from '../hooks/useSurfaceColors';

/** Typed confirmation phrase (spacing / case normalized on compare). */
const ERASE_WALLET_CONFIRM_PHRASE = 'Erase all data';

const normalizeErasePhraseInput = (s) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

const TRAY_CLEARANCE_PB =
  'calc(6.5rem + env(safe-area-inset-bottom, 0px))';

/** Field + button tokens scoped to Settings (supports light mode). */
function useSettingsChrome() {
  const inputBg = useColorModeValue('white', 'black');
  const border = useColorModeValue('gray.300', 'whiteAlpha.300');
  const inputFg = useColorModeValue('gray.900', 'white');
  const placeholder = useColorModeValue('blackAlpha.500', 'whiteAlpha.500');
  const hoverBorder = useColorModeValue('gray.400', 'whiteAlpha.400');
  const primaryBg = useColorModeValue('gray.200', 'gray.800');
  const primaryFg = useColorModeValue('gray.900', 'white');
  const primaryHover = useColorModeValue('gray.300', 'gray.700');
  const primaryActive = primaryHover;
  const segmentTrack = useColorModeValue(
    'rgba(15, 23, 42, 0.06)',
    'rgba(255, 255, 255, 0.06)'
  );
  const segmentActiveBg = useColorModeValue('white', 'whiteAlpha.200');
  const segmentActiveFg = useColorModeValue('gray.900', 'white');
  const segmentIdleFg = useColorModeValue('gray.600', 'whiteAlpha.700');
  const segmentShadow = useColorModeValue(
    '0 1px 3px rgba(15, 23, 42, 0.12)',
    '0 1px 3px rgba(0, 0, 0, 0.35)'
  );

  const inputProps = {
    bg: inputBg,
    borderColor: border,
    color: inputFg,
    _placeholder: { color: placeholder },
    _hover: { borderColor: hoverBorder },
  };

  const primaryButtonProps = {
    size: 'md',
    h: '12',
    rounded: 'xl',
    bg: primaryBg,
    color: primaryFg,
    fontWeight: 'semibold',
    _hover: { bg: primaryHover },
    _active: { bg: primaryActive },
  };

  return {
    inputProps,
    primaryButtonProps,
    segmentTrack,
    segmentActiveBg,
    segmentActiveFg,
    segmentIdleFg,
    segmentShadow,
  };
}

function SettingsPanel({ title, description, children, testId }) {
  const { pageFg, mutedFg } = useSurfaceColors();
  return (
    <Box
      className="lucem-inset-surface"
      rounded="3xl"
      p={{ base: 4, md: 5 }}
      data-testid={testId}
    >
      {title ? (
        <Text
          fontSize="md"
          fontWeight="bold"
          color={pageFg}
          letterSpacing="tight"
          mb={description ? 1 : 4}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text fontSize="sm" color={mutedFg} mb={4}>
          {description}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

function SettingsToggleRow({ label, hint, control }) {
  const { softFg, subtleFg } = useSurfaceColors();
  return (
    <Flex align="center" justify="space-between" gap={4} w="full">
      <Box flex="1" minW={0}>
        <Text color={softFg} fontWeight="semibold" fontSize="sm">
          {label}
        </Text>
        {hint ? (
          <Text color={subtleFg} fontSize="xs" mt={1} lineHeight="short">
            {hint}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>{control}</Box>
    </Flex>
  );
}

function SegmentedChoice({ value, options, onChange, 'aria-label': ariaLabel }) {
  const {
    segmentTrack,
    segmentActiveBg,
    segmentActiveFg,
    segmentIdleFg,
    segmentShadow,
  } = useSettingsChrome();

  return (
    <Flex
      role="radiogroup"
      aria-label={ariaLabel}
      w="full"
      p="1"
      rounded="xl"
      bg={segmentTrack}
      gap={1}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Button
            key={opt.value}
            flex={1}
            size="sm"
            h="9"
            rounded="lg"
            variant="unstyled"
            fontWeight="semibold"
            fontSize="sm"
            bg={selected ? segmentActiveBg : 'transparent'}
            color={selected ? segmentActiveFg : segmentIdleFg}
            boxShadow={selected ? segmentShadow : 'none'}
            onClick={() => onChange(opt.value)}
            aria-checked={selected}
            role="radio"
          >
            {opt.label}
          </Button>
        );
      })}
    </Flex>
  );
}

const Settings = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const accountRef = React.useRef(null);
  const settings = useStoreState((state) => state.settings.settings);
  const setSettings = useStoreActions(
    (actions) => actions.settings.setSettings
  );
  const { appearance, setAppearance } = useAppearancePreference();
  const { mutedFg, subtleFg } = useSurfaceColors();
  const {
    inputProps: settingsInputProps,
    primaryButtonProps: settingsPrimaryButtonProps,
  } = useSettingsChrome();
  const iconBorder = useColorModeValue('gray.300', 'whiteAlpha.300');
  const iconFg = useColorModeValue('gray.800', 'whiteAlpha.900');
  const iconBtnBg = useColorModeValue('gray.100', 'black');
  const iconBtnHover = useColorModeValue('gray.200', 'whiteAlpha.50');
  const eraseModalBg = useColorModeValue('white', 'gray.900');
  const eraseModalFg = useColorModeValue('gray.900', 'white');
  const phraseHint = useColorModeValue('gray.600', 'whiteAlpha.600');
  const dangerBg = useColorModeValue('red.50', 'rgba(120, 20, 20, 0.35)');
  const dangerFg = useColorModeValue('red.700', 'red.100');
  const dangerBorder = useColorModeValue('red.300', 'red.400');
  const dangerHover = useColorModeValue('red.100', 'rgba(160, 30, 30, 0.45)');
  const [refreshed, setRefreshed] = React.useState(false);
  const [account, setAccount] = React.useState({ name: '', avatar: '' });
  const changePasswordRef = React.useRef();
  const [eraseModalOpen, setEraseModalOpen] = React.useState(false);
  const [eraseAck, setEraseAck] = React.useState(false);
  const [erasePhrase, setErasePhrase] = React.useState('');
  const [eraseBusy, setEraseBusy] = React.useState(false);
  const [whitelisted, setWhitelisted] = React.useState(null);
  const rowBg = useColorModeValue('gray.100', 'whiteAlpha.50');
  const rowBorder = useColorModeValue('gray.200', 'whiteAlpha.100');
  const rowText = useColorModeValue('gray.900', 'white');
  const closeIcon = useColorModeValue('gray.600', 'whiteAlpha.700');
  const closeHover = useColorModeValue('gray.800', 'white');
  const emptyHint = useColorModeValue('gray.600', 'whiteAlpha.500');

  const currency = settings.currency === 'eur' ? 'eur' : 'usd';

  const avatarHandler = async () => {
    const avatar = Math.random().toString();
    account.avatar = avatar;
    await setAccountAvatar(account.avatar);
    setAccount({ ...account });
    accountRef.current?.updateAccount?.();
  };

  const refreshHandler = async () => {
    setRefreshed(true);

    const currentIndex = await getCurrentAccountIndex();
    const accounts = await getStorage(STORAGE.accounts);
    const currentAccount = accounts[currentIndex];
    const network = await getNetwork();
    currentAccount[network.id].forceUpdate = true;

    await setStorage({
      [STORAGE.accounts]: {
        ...accounts,
      },
    });

    navigate('/wallet');
  };

  const loadWhitelist = () =>
    getWhitelisted().then((next) => {
      setWhitelisted(next);
    });

  React.useEffect(() => {
    getCurrentAccount().then((nextAccount) => {
      setAccount(nextAccount);
    });
    loadWhitelist();
  }, []);

  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      position="relative"
      w="full"
      maxW="100%"
      className="lucem-settings-shell lucem-wallet-main-column"
      data-testid="settings-page"
    >
      <Flex align="center" px={{ base: 3, md: 4 }} pt={4} pb={2}>
        <Text flex="1" textAlign="center" fontSize="xl" fontWeight="bold">
          Settings
        </Text>
      </Flex>

      <Box
        flex="1"
        minH={0}
        overflowY="auto"
        w="full"
        px={{ base: 4, md: 6 }}
        pb={TRAY_CLEARANCE_PB}
      >
        <Stack spacing={4} w="full" maxW="sm" mx="auto" pt={1}>
          <SettingsPanel
            title="Profile"
            description="Avatar for the active account. Rename accounts from the Accounts page."
            testId="settings-profile-panel"
          >
            <Flex align="center" justify="center" gap={5} w="full">
              <Box
                w="72px"
                h="72px"
                flexShrink={0}
                rounded="full"
                overflow="hidden"
              >
                <AvatarLoader
                  forceUpdate
                  avatar={account.avatar}
                  width="full"
                />
              </Box>
              <IconButton
                onClick={avatarHandler}
                rounded="lg"
                size="md"
                variant="outline"
                borderColor={iconBorder}
                color={iconFg}
                bg={iconBtnBg}
                _hover={{ bg: iconBtnHover }}
                aria-label="New avatar"
                icon={<RepeatIcon />}
              />
            </Flex>
          </SettingsPanel>

          <SettingsPanel
            title="Preferences"
            description="Display and layout choices for this device."
            testId="settings-preferences-panel"
          >
            <Stack spacing={5}>
              <Box>
                <Text color={mutedFg} fontWeight="semibold" fontSize="sm" mb={2}>
                  Currency
                </Text>
                <SegmentedChoice
                  aria-label="Fiat currency"
                  value={currency}
                  onChange={(next) => {
                    setSettings({ ...settings, currency: next });
                  }}
                  options={[
                    { value: 'usd', label: 'USD' },
                    { value: 'eur', label: 'EUR' },
                  ]}
                />
              </Box>

              <Box>
                <Text color={mutedFg} fontWeight="semibold" fontSize="sm" mb={2}>
                  Appearance
                </Text>
                <SegmentedChoice
                  aria-label="Appearance"
                  value={appearance}
                  onChange={setAppearance}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'System' },
                  ]}
                />
              </Box>

              <Box data-testid="settings-swap-trays">
                <SettingsToggleRow
                  label="Swap tray positions"
                  hint={
                    settings.swapTrays
                      ? 'Actions on the left, network on the right.'
                      : 'Network on the left, actions on the right.'
                  }
                  control={
                    <ButtonSwitch
                      isChecked={Boolean(settings.swapTrays)}
                      colorScheme="yellow"
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          swapTrays: e.target.checked,
                        });
                      }}
                      aria-label="Swap bottom tray positions"
                    />
                  }
                />
              </Box>
            </Stack>
          </SettingsPanel>

          <SettingsPanel
            title="Whitelisted sites"
            description="dApps allowed to connect to Lucem."
            testId="settings-whitelist-panel"
          >
            {whitelisted ? (
              whitelisted.length > 0 ? (
                <Flex direction="column" gap={2} w="full">
                  {whitelisted.map((origin, index) => (
                    <Flex
                      key={index}
                      align="center"
                      justify="space-between"
                      gap={3}
                      py={3}
                      px={3}
                      rounded="2xl"
                      bg={rowBg}
                      borderWidth="1px"
                      borderColor={rowBorder}
                    >
                      <Image
                        width="24px"
                        src={platform.icons.getFaviconUrl(origin)}
                        fallback={
                          <SkeletonCircle width="24px" height="24px" />
                        }
                      />
                      <Text
                        flex="1"
                        color={rowText}
                        fontSize="sm"
                        fontWeight="medium"
                        isTruncated
                      >
                        {origin.split('//')[1]}
                      </Text>
                      <SmallCloseIcon
                        cursor="pointer"
                        color={closeIcon}
                        _hover={{ color: closeHover }}
                        aria-label={`Remove ${origin}`}
                        onClick={async () => {
                          await removeWhitelisted(origin);
                          loadWhitelist();
                        }}
                      />
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Text textAlign="center" color={emptyHint} py={4} fontSize="sm">
                  No whitelisted sites
                </Text>
              )
            ) : (
              <Flex w="full" py={6} align="center" justify="center">
                <Spinner color="yellow" speed="0.5s" />
              </Flex>
            )}
          </SettingsPanel>

          <SettingsPanel
            title="Advanced"
            description="Optional receive-address options for the active account."
            testId="settings-advanced-panel"
          >
            <MultiAddressSettings
              account={account}
              onIndicesChange={(externalIndices) => {
                setAccount((prev) => ({ ...prev, externalIndices }));
              }}
            />
          </SettingsPanel>

          <SettingsPanel
            title="Security & data"
            testId="settings-security-panel"
          >
            <Stack
              spacing={3}
              className="lucem-equal-width-actions"
              data-testid="settings-primary-actions"
            >
              <Button
                {...settingsPrimaryButtonProps}
                isDisabled={refreshed}
                onClick={refreshHandler}
              >
                Refresh Balance
              </Button>
              <Button
                {...settingsPrimaryButtonProps}
                onClick={() => {
                  changePasswordRef.current.openModal();
                }}
              >
                Change Password
              </Button>
              <Button
                {...settingsPrimaryButtonProps}
                borderWidth="1px"
                borderColor={dangerBorder}
                bg={dangerBg}
                color={dangerFg}
                _hover={{ bg: dangerHover, borderColor: dangerBorder }}
                _active={{ bg: dangerHover }}
                onClick={() => {
                  setEraseAck(false);
                  setErasePhrase('');
                  setEraseModalOpen(true);
                }}
              >
                Erase all data
              </Button>
            </Stack>
            <Text mt={3} fontSize="xs" color={subtleFg} textAlign="center">
              Erase removes every Lucem account, keys, and settings from this
              browser or extension. You will need your recovery phrase to use
              funds again.
            </Text>
          </SettingsPanel>

          <SettingsPanel title="About" testId="settings-about-panel">
            <AboutContent showLegal={false} />
            <Box mt={4}>
              <Text color={mutedFg} fontWeight="semibold" fontSize="sm" mb={1}>
                Legal
              </Text>
              <LegalSettings />
            </Box>
          </SettingsPanel>
        </Stack>
      </Box>

      <Modal
        isOpen={eraseModalOpen}
        onClose={() => {
          if (!eraseBusy) setEraseModalOpen(false);
        }}
        isCentered
        size="sm"
      >
        <ModalOverlay />
        <ModalContent bg={eraseModalBg} color={eraseModalFg} mx={3}>
          <ModalHeader fontSize="md">Erase all data on this device?</ModalHeader>
          <ModalBody>
            <Text fontSize="sm" mb={3}>
              This permanently removes all Lucem data from this browser or
              extension: encrypted keys, accounts, network choice, whitelisted
              sites, and local UI state. It cannot be undone. Your recovery
              phrase (or hardware wallet backup) is the only way to access funds
              again.
            </Text>
            <Checkbox
              isChecked={eraseAck}
              onChange={(e) => setEraseAck(e.target.checked)}
              colorScheme="yellow"
              mb={3}
            >
              I have saved my recovery phrase or I accept losing access to these
              funds.
            </Checkbox>
            <Text fontSize="xs" color={phraseHint} mb={1}>
              Type the phrase below (spacing and capitalization are flexible):
            </Text>
            <Text
              fontSize="sm"
              fontFamily="mono"
              color="yellow.200"
              mb={2}
              userSelect="all"
            >
              {ERASE_WALLET_CONFIRM_PHRASE}
            </Text>
            <Input
              {...settingsInputProps}
              rounded="md"
              value={erasePhrase}
              onChange={(e) => setErasePhrase(e.target.value)}
              placeholder={ERASE_WALLET_CONFIRM_PHRASE}
              autoComplete="off"
            />
          </ModalBody>
          <ModalFooter flexDirection="column" gap={2}>
            <Button
              w="full"
              colorScheme="red"
              isDisabled={
                !eraseAck ||
                normalizeErasePhraseInput(erasePhrase) !==
                  normalizeErasePhraseInput(ERASE_WALLET_CONFIRM_PHRASE) ||
                eraseBusy
              }
              isLoading={eraseBusy}
              onClick={async () => {
                setEraseBusy(true);
                try {
                  await eraseLocalWalletData();
                  setEraseModalOpen(false);
                  toast({
                    title: 'All local data erased',
                    description: 'Reloading…',
                    status: 'success',
                    duration: 2000,
                  });
                  window.setTimeout(() => {
                    platform.navigation.reloadToWalletBootstrap();
                  }, 250);
                } catch (e) {
                  toast({
                    title: 'Could not erase data',
                    description:
                      e && e.message ? String(e.message) : 'Please try again.',
                    status: 'error',
                    duration: 5000,
                  });
                  setEraseBusy(false);
                }
              }}
            >
              Erase all data
            </Button>
            <Button
              variant="ghost"
              w="full"
              isDisabled={eraseBusy}
              onClick={() => setEraseModalOpen(false)}
            >
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <ChangePasswordModal ref={changePasswordRef} />
    </Box>
  );
};

export default Settings;
