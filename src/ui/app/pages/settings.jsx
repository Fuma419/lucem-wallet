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
  InputGroup,
  InputRightElement,
  Icon,
  useToast,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  RadioGroup,
  Radio,
  useColorModeValue,
  Wrap,
  WrapItem,
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
  setAccountName,
  setStorage,
} from '../../../api/extension';
import { useNavigate } from 'react-router-dom';
import { STORAGE } from '../../../config/config';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { MdModeEdit } from 'react-icons/md';
import AvatarLoader from '../components/avatarLoader';
import { ChangePasswordModal } from '../components/changePasswordModal';
import { LegalSettings } from '../../../features/settings/legal/LegalSettings';

/** Typed confirmation phrase (spacing / case normalized on compare). */
const ERASE_WALLET_CONFIRM_PHRASE = 'Erase all data';

const normalizeErasePhraseInput = (s) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

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

  const inputProps = {
    bg: inputBg,
    borderColor: border,
    color: inputFg,
    _placeholder: { color: placeholder },
    _hover: { borderColor: hoverBorder },
  };

  const primaryButtonProps = {
    size: 'md',
    w: 'full',
    h: '12',
    rounded: 'xl',
    bg: primaryBg,
    color: primaryFg,
    fontWeight: 'semibold',
    _hover: { bg: primaryHover },
    _active: { bg: primaryActive },
  };

  return { inputProps, primaryButtonProps };
}

function SettingsSectionTitle({ children }) {
  const titleColor = useColorModeValue('gray.900', 'white');
  return (
    <Text
      fontSize="md"
      fontWeight="bold"
      color={titleColor}
      letterSpacing="tight"
      mb={3}
      mt={1}
    >
      {children}
    </Text>
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
  const { inputProps: settingsInputProps, primaryButtonProps: settingsPrimaryButtonProps } =
    useSettingsChrome();
  const labelMuted = useColorModeValue('gray.700', 'white');
  const iconBorder = useColorModeValue('gray.300', 'whiteAlpha.300');
  const iconFg = useColorModeValue('gray.800', 'whiteAlpha.900');
  const iconBtnBg = useColorModeValue('gray.100', 'black');
  const iconBtnHover = useColorModeValue('gray.200', 'whiteAlpha.50');
  const editIcon = useColorModeValue('gray.500', 'whiteAlpha.700');
  const hintColor = useColorModeValue('gray.600', 'whiteAlpha.500');
  const eraseModalBg = useColorModeValue('white', 'gray.900');
  const eraseModalFg = useColorModeValue('gray.900', 'white');
  const phraseHint = useColorModeValue('gray.600', 'whiteAlpha.600');
  const sectionDivider = useColorModeValue('gray.300', 'whiteAlpha.200');
  const [refreshed, setRefreshed] = React.useState(false);
  const [account, setAccount] = React.useState({ name: '', avatar: '' });
  const [originalName, setOriginalName] = React.useState('');
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

  const nameHandler = async () => {
    await setAccountName(account.name);
    setOriginalName(account.name);
    accountRef.current?.updateAccount?.();
  };

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
      setOriginalName(nextAccount.name);
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
        px={{ base: 4, md: 5 }}
        pb="calc(6.5rem + env(safe-area-inset-bottom, 0px))"
      >
        <Box w="full" maxW="sm" mx="auto" pt={1}>
          <SettingsSectionTitle>Account</SettingsSectionTitle>
          <InputGroup size="md" w="full">
            <Input
              variant="outline"
              rounded="xl"
              {...settingsInputProps}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  account.name.length > 0 &&
                  account.name !== originalName
                )
                  nameHandler();
              }}
              placeholder="Account name"
              value={account.name}
              onChange={(e) => {
                account.name = e.target.value;
                setAccount({ ...account });
              }}
              pr="4.5rem"
            />
            <InputRightElement width="4.5rem" h="full">
              {account.name === originalName ? (
                <Icon mr="-2" as={MdModeEdit} color={editIcon} />
              ) : (
                <Button
                  isDisabled={account.name.length <= 0}
                  h="1.75rem"
                  size="sm"
                  rounded="md"
                  onClick={nameHandler}
                >
                  Apply
                </Button>
              )}
            </InputRightElement>
          </InputGroup>

          <Flex align="center" justify="center" gap={5} mt={8} w="full">
            <Box w="72px" h="72px" flexShrink={0} rounded="full" overflow="hidden">
              <AvatarLoader forceUpdate avatar={account.avatar} width="full" />
            </Box>
            <IconButton
              onClick={() => {
                avatarHandler();
              }}
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

          <Flex align="center" justify="center" gap={3} mt={8} w="full">
            <Text color={labelMuted} fontWeight="medium">
              USD
            </Text>
            <ButtonSwitch
              defaultChecked={settings.currency !== 'usd'}
              onChange={(e) => {
                if (e.target.checked) {
                  setSettings({ ...settings, currency: 'eur' });
                } else {
                  setSettings({ ...settings, currency: 'usd' });
                }
              }}
            />
            <Text color={labelMuted} fontWeight="medium">
              EUR
            </Text>
          </Flex>

          <Flex direction="column" align="stretch" gap={2} mt={8} w="full">
            <Text color={labelMuted} fontWeight="semibold" fontSize="sm">
              Appearance
            </Text>
            <RadioGroup onChange={setAppearance} value={appearance}>
              <Wrap spacing={4} rowGap={3}>
                <WrapItem>
                  <Radio value="dark" colorScheme="yellow">
                    Dark
                  </Radio>
                </WrapItem>
                <WrapItem>
                  <Radio value="light" colorScheme="yellow">
                    Light
                  </Radio>
                </WrapItem>
                <WrapItem>
                  <Radio value="system" colorScheme="yellow">
                    System
                  </Radio>
                </WrapItem>
              </Wrap>
            </RadioGroup>
          </Flex>

          <Flex direction="column" gap={3} mt={8} w="full">
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
          </Flex>
          <Button
            mt={10}
            {...settingsPrimaryButtonProps}
            borderWidth="1px"
            borderColor="red.400"
            bg="rgba(120, 20, 20, 0.35)"
            color="red.100"
            _hover={{ bg: 'rgba(160, 30, 30, 0.45)', borderColor: 'red.300' }}
            _active={{ bg: 'rgba(160, 30, 30, 0.55)' }}
            onClick={() => {
              setEraseAck(false);
              setErasePhrase('');
              setEraseModalOpen(true);
            }}
          >
            Erase all data
          </Button>
          <Text mt={3} fontSize="xs" color={hintColor} textAlign="center" w="full">
            Removes every Lucem account, keys, and settings from this browser or
            extension. You will need your recovery phrase to use funds again.
          </Text>

          <Box borderTopWidth="1px" borderColor={sectionDivider} my={8} />

          <SettingsSectionTitle>Whitelisted sites</SettingsSectionTitle>
          {whitelisted ? (
            whitelisted.length > 0 ? (
              <Flex direction="column" gap={3} w="full">
                {whitelisted.map((origin, index) => (
                  <Flex
                    key={index}
                    align="center"
                    justify="space-between"
                    gap={3}
                    py={3}
                    px={4}
                    rounded="xl"
                    bg={rowBg}
                    borderWidth="1px"
                    borderColor={rowBorder}
                  >
                    <Image
                      width="24px"
                      src={platform.icons.getFaviconUrl(origin)}
                      fallback={<SkeletonCircle width="24px" height="24px" />}
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
                      onClick={async () => {
                        await removeWhitelisted(origin);
                        loadWhitelist();
                      }}
                    />
                  </Flex>
                ))}
              </Flex>
            ) : (
              <Text textAlign="center" color={emptyHint} py={6} fontSize="sm">
                No whitelisted sites
              </Text>
            )
          ) : (
            <Flex w="full" py={8} align="center" justify="center">
              <Spinner color="yellow" speed="0.5s" />
            </Flex>
          )}

          <Box borderTopWidth="1px" borderColor={sectionDivider} my={8} />

          <SettingsSectionTitle>Legal</SettingsSectionTitle>
          <LegalSettings />

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
                  sites, and local UI state. It cannot be undone. Your recovery phrase
                  (or hardware wallet backup) is the only way to access funds again.
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
      </Box>
    </Box>
  );
};

export default Settings;
