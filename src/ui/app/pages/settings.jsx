import {
  Box,
  Button,
  IconButton,
  Text,
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
  useColorMode,
  Stack,
} from '@chakra-ui/react';
import { useAppearancePreference } from '../../appearanceContext';
import { SmallCloseIcon, RepeatIcon, DownloadIcon, AttachmentIcon } from '@chakra-ui/icons';
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
  exportAppData,
  importAppData,
  resolveGlowEffects,
} from '../../../api/extension';
import { vaultRequiresExistingPassword } from '../../../api/extension/vault';
import { useNavigate } from 'react-router-dom';
import { STORAGE, NETWORK_ID, NODE } from '../../../config/config';
import { useStoreState, useStoreActions } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { ChangePasswordModal } from '../components/changePasswordModal';
import { LegalSettings } from '../../../features/settings/legal/LegalSettings';
import { AboutContent } from '../components/about';
import useSurfaceColors from '../hooks/useSurfaceColors';
import {
  SettingsPanel,
  SettingsToggleRow,
  SettingsChoiceField,
  SettingsFieldStack,
  SegmentedChoice,
  useSettingsChrome,
} from '../components/settingsChrome';
import ProviderStatus from '../components/providerStatus';

/** Typed confirmation phrase (spacing / case normalized on compare). */
const ERASE_WALLET_CONFIRM_PHRASE = 'Erase all data';

const normalizeErasePhraseInput = (s) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

const TRAY_CLEARANCE_PB =
  'calc(6.5rem + env(safe-area-inset-bottom, 0px))';

const Settings = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useStoreState((state) => state.settings.settings);
  const setSettings = useStoreActions(
    (actions) => actions.settings.setSettings
  );
  const { appearance, setAppearance } = useAppearancePreference();
  const { colorMode } = useColorMode();
  const glowOn = resolveGlowEffects(settings?.glowEffectsStored, colorMode);
  const { mutedFg, subtleFg } = useSurfaceColors();
  const {
    inputProps: settingsInputProps,
    primaryButtonProps: settingsPrimaryButtonProps,
    rowDivider,
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
  const [canChangePassword, setCanChangePassword] = React.useState(false);
  const [eraseModalOpen, setEraseModalOpen] = React.useState(false);
  const [eraseAck, setEraseAck] = React.useState(false);
  const [erasePhrase, setErasePhrase] = React.useState('');
  const [eraseBusy, setEraseBusy] = React.useState(false);
  const [whitelisted, setWhitelisted] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const importFileRef = React.useRef();
  const rowBg = useColorModeValue('gray.100', 'whiteAlpha.50');
  const rowBorder = useColorModeValue('gray.200', 'whiteAlpha.100');
  const rowText = useColorModeValue('gray.900', 'white');
  const closeIcon = useColorModeValue('gray.600', 'whiteAlpha.700');
  const closeHover = useColorModeValue('gray.800', 'white');
  const emptyHint = useColorModeValue('gray.600', 'whiteAlpha.500');

  const currency = settings.currency === 'eur' ? 'eur' : 'usd';
  const networkId = settings.network?.id;

  const onNetworkChange = (nextId) => {
    if (!nextId || nextId === networkId) return;
    // setSettings persists the network (store action calls setNetwork) and
    // recomputes adaSymbol; WalletShell remounts pages on the id change so
    // balances/history reload for the new network.
    setSettings({
      ...settings,
      network: { ...settings.network, id: nextId, node: NODE[nextId] },
    });
  };

  const avatarHandler = async () => {
    const avatar = Math.random().toString();
    account.avatar = avatar;
    await setAccountAvatar(account.avatar);
    setAccount({ ...account });
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

  const exportHandler = React.useCallback(async () => {
    try {
      const backup = await exportAppData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lucem-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: 'Backup exported',
        description: 'No private keys are included — seeds stay on this device.',
        status: 'success',
        duration: 5000,
      });
    } catch (e) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Could not export wallet data.',
        status: 'error',
        duration: 5000,
      });
    }
  }, [toast]);

  const onImportFile = React.useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        const { accounts } = await importAppData(backup);
        toast({
          title: 'Backup restored',
          description: `${accounts} account(s) restored. Restore each recovery phrase to enable signing.`,
          status: 'success',
          duration: 6000,
        });
        window.location.reload();
      } catch (e) {
        setImporting(false);
        toast({
          title: 'Import failed',
          description: e?.message || 'Could not read this backup file.',
          status: 'error',
          duration: 6000,
        });
      }
    },
    [toast]
  );

  React.useEffect(() => {
    getCurrentAccount().then((nextAccount) => {
      setAccount(nextAccount);
    });
    loadWhitelist();
    let cancelled = false;
    vaultRequiresExistingPassword()
      .then((ok) => {
        if (!cancelled) setCanChangePassword(ok);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
        className="lucem-tray-clearance"
        px={{ base: 4, md: 6 }}
        pb={TRAY_CLEARANCE_PB}
      >
        <Stack spacing={4} w="full" maxW={{ base: '100%', xl: 'sm' }} mx="auto" pt={1}>
          <SettingsPanel testId="settings-account-panel">
            <Flex align="center" gap={4} w="full">
              <Box
                w="56px"
                h="56px"
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
              <Box flex="1" minW={0}>
                <Text fontWeight="bold" fontSize="md" noOfLines={1}>
                  {account.name || 'Account'}
                </Text>
                <Text fontSize="xs" color={subtleFg} mt={0.5}>
                  Change display name on the Accounts page
                </Text>
              </Box>
              <IconButton
                onClick={avatarHandler}
                rounded="lg"
                size="sm"
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
            title="Network"
            description="Choose which Cardano network Lucem connects to."
            testId="settings-network-panel"
          >
            <SettingsChoiceField label="Cardano network">
              <SegmentedChoice
                aria-label="Cardano network"
                value={networkId}
                onChange={onNetworkChange}
                options={[
                  { value: NETWORK_ID.mainnet, label: 'Mainnet' },
                  { value: NETWORK_ID.preprod, label: 'Preprod' },
                  { value: NETWORK_ID.preview, label: 'Preview' },
                ]}
              />
            </SettingsChoiceField>
            <ProviderStatus networkId={networkId} />
          </SettingsPanel>

          <SettingsPanel
            title="Display"
            testId="settings-preferences-panel"
          >
            <SettingsFieldStack>
              <SettingsChoiceField label="Currency">
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
              </SettingsChoiceField>

              <SettingsChoiceField label="Appearance">
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
              </SettingsChoiceField>

              <SettingsToggleRow
                data-testid="settings-swap-trays"
                label="Swap tray positions"
                hint={
                  settings.swapTrays
                    ? 'Actions on the left, accounts on the right.'
                    : 'Accounts on the left, actions on the right.'
                }
                isChecked={Boolean(settings.swapTrays)}
                offLabel="Default"
                onLabel="Swapped"
                onChange={(checked) => {
                  setSettings({
                    ...settings,
                    swapTrays: checked,
                  });
                }}
                aria-label="Swap bottom tray positions"
              />

              <SettingsToggleRow
                data-testid="settings-glow-effects"
                label="Button glow effects"
                hint={
                  glowOn
                    ? 'Neon glows on wallet and tray buttons. Light mode is off unless you turn this on.'
                    : 'Solid buttons without neon glow. Light mode is off by default.'
                }
                isChecked={glowOn}
                offLabel="Off"
                onLabel="On"
                onChange={(checked) => {
                  setSettings({
                    ...settings,
                    glowEffects: checked,
                    glowEffectsStored: checked,
                  });
                }}
                aria-label="Enable button glow effects"
              />
            </SettingsFieldStack>
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

          <SettingsPanel title="Wallet" testId="settings-security-panel">
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
              {canChangePassword ? (
                <Button
                  {...settingsPrimaryButtonProps}
                  onClick={() => {
                    changePasswordRef.current.openModal();
                  }}
                >
                  Change Password
                </Button>
              ) : null}
            </Stack>

            <Box borderTopWidth="1px" borderColor={rowDivider} mt={5} pt={5}>
              <Text fontSize="sm" fontWeight="bold" mb={1}>
                Data
              </Text>
              <Text fontSize="xs" color={subtleFg} mb={3}>
                Back up accounts and settings, or wipe this device. Backups never
                contain private keys or seed phrases.
              </Text>
              <Stack
                spacing={3}
                className="lucem-equal-width-actions"
                data-testid="settings-backup-actions"
              >
                <Button
                  size="md"
                  h="12"
                  rounded="xl"
                  fontWeight="semibold"
                  leftIcon={<DownloadIcon />}
                  variant="outline"
                  onClick={exportHandler}
                  data-testid="settings-export-button"
                >
                  Export Data
                </Button>
                <Button
                  size="md"
                  h="12"
                  rounded="xl"
                  fontWeight="semibold"
                  leftIcon={<AttachmentIcon />}
                  variant="outline"
                  isLoading={importing}
                  onClick={() => importFileRef.current?.click()}
                  data-testid="settings-import-button"
                >
                  Import Data
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
              <input
                ref={importFileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={onImportFile}
                data-testid="settings-import-file"
              />
            </Box>
          </SettingsPanel>

          <SettingsPanel title="About" testId="settings-about-panel">
            <AboutContent showLegal={false} />
            <Box mt={4} borderTopWidth="1px" borderColor={rowDivider} pt={4}>
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
