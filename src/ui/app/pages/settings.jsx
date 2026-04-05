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
  Select,
  useToast,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@chakra-ui/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SmallCloseIcon,
  RepeatIcon,
  CheckIcon,
} from '@chakra-ui/icons';
import React from 'react';
import platform from '../../../platform';
import {
  getCurrentAccount,
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  getWhitelisted,
  removeWhitelisted,
  resetStorage,
  eraseLocalWalletData,
  setAccountAvatar,
  setAccountName,
  setStorage,
} from '../../../api/extension';
import Account from '../components/account';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { NETWORK_ID, NODE, STORAGE } from '../../../config/config';
import ConfirmModal from '../components/confirmModal';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { MdModeEdit } from 'react-icons/md';
import AvatarLoader from '../components/avatarLoader';
import { ChangePasswordModal } from '../components/changePasswordModal';
import { LegalSettings } from '../../../features/settings/legal/LegalSettings';

/** Must match the gray link label so users type what they already read. */
const ERASE_WALLET_CONFIRM_PHRASE = 'Erase data on this device';

const normalizeErasePhraseInput = (s) =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

const settingsInputProps = {
  bg: 'black',
  borderColor: 'whiteAlpha.300',
  color: 'white',
  _placeholder: { color: 'whiteAlpha.500' },
  _hover: { borderColor: 'whiteAlpha.400' },
};

const settingsPrimaryButtonProps = {
  size: 'md',
  w: 'full',
  h: '12',
  rounded: 'xl',
  bg: 'gray.800',
  color: 'white',
  fontWeight: 'semibold',
  _hover: { bg: 'gray.700' },
  _active: { bg: 'gray.700' },
};

function SettingsListNavItem({ label, onClick }) {
  return (
    <Box
      as="button"
      type="button"
      w="full"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      py={4}
      px={4}
      rounded="xl"
      bg="transparent"
      borderWidth={0}
      cursor="pointer"
      transition="background 0.15s ease"
      _hover={{ bg: 'whiteAlpha.50' }}
      onClick={onClick}
    >
      <Text fontWeight="semibold" color="white" fontSize="md" textAlign="left">
        {label}
      </Text>
      <ChevronRightIcon color="whiteAlpha.600" boxSize={5} />
    </Box>
  );
}

function SettingsPageTitle({ children }) {
  return (
    <Text
      textAlign="center"
      fontSize="xl"
      fontWeight="bold"
      color="white"
      letterSpacing="tight"
      mb={6}
      mt={1}
    >
      {children}
    </Text>
  );
}

const Settings = () => {
  const navigate = useNavigate();
  const accountRef = React.useRef();
  return (
    <>
      <Box
        minH="100vh"
        sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        position="relative"
        w="full"
        maxW="100%"
        bg="black"
        className="lucem-settings-shell lucem-wallet-main-column"
      >
        <Account
          ref={accountRef}
          leadingSlot={
            <IconButton
              rounded="md"
              onClick={() => navigate(-1)}
              variant="ghost"
              icon={<ChevronLeftIcon boxSize="6" />}
              aria-label="Go back"
            />
          }
        />

        <Box
          flex="1"
          minH={0}
          overflowY="auto"
          w="full"
          px={{ base: 4, md: 5 }}
          pb="calc(1.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <Routes>
            <Route path="*" element={<Overview />} />
            <Route
              path="general"
              element={<GeneralSettings accountRef={accountRef} />}
            />
            <Route path="whitelisted" element={<Whitelisted />} />
            <Route path="network" element={<Network />} />
            <Route path="legal" element={<LegalSettings />} />
          </Routes>
        </Box>
      </Box>
    </>
  );
};

const Overview = () => {
  const navigate = useNavigate();
  return (
    <Box w="full" maxW="md" mx="auto" pt={1}>
      <SettingsPageTitle>Settings</SettingsPageTitle>
      <Flex direction="column" gap={2}>
        <SettingsListNavItem
          label="General settings"
          onClick={() => navigate('general')}
        />
        <SettingsListNavItem
          label="Whitelisted sites"
          onClick={() => navigate('whitelisted')}
        />
        <SettingsListNavItem
          label="Network"
          onClick={() => navigate('network')}
        />
        <SettingsListNavItem
          label="Legal"
          onClick={() => navigate('legal')}
        />
      </Flex>
    </Box>
  );
};

const GeneralSettings = ({ accountRef }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useStoreState((state) => state.settings.settings);
  const setSettings = useStoreActions(
    (actions) => actions.settings.setSettings
  );
  const [refreshed, setRefreshed] = React.useState(false);
  const [account, setAccount] = React.useState({ name: '', avatar: '' });
  const [originalName, setOriginalName] = React.useState('');
  // const { colorMode, toggleColorMode } = useColorMode();
  const ref = React.useRef();
  const changePasswordRef = React.useRef();
  const [eraseModalOpen, setEraseModalOpen] = React.useState(false);
  const [eraseAck, setEraseAck] = React.useState(false);
  const [erasePhrase, setErasePhrase] = React.useState('');
  const [eraseBusy, setEraseBusy] = React.useState(false);

  const nameHandler = async () => {
    await setAccountName(account.name);
    setOriginalName(account.name);
    accountRef.current.updateAccount();
  };

  const avatarHandler = async () => {
    const avatar = Math.random().toString();
    account.avatar = avatar;
    await setAccountAvatar(account.avatar);
    setAccount({ ...account });
    accountRef.current.updateAccount();
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

  React.useEffect(() => {
    getCurrentAccount().then((account) => {
      setOriginalName(account.name);
      setAccount(account);
    });
  }, []);

  return (
    <Box w="full" maxW="sm" mx="auto" pt={1}>
      <SettingsPageTitle>General settings</SettingsPageTitle>
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
            <Icon mr="-2" as={MdModeEdit} color="whiteAlpha.700" />
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
          borderColor="whiteAlpha.300"
          color="whiteAlpha.900"
          bg="black"
          _hover={{ bg: 'whiteAlpha.50' }}
          aria-label="New avatar"
          icon={<RepeatIcon />}
        />
      </Flex>

      <Flex
        align="center"
        justify="center"
        gap={3}
        mt={8}
        w="full"
      >
        <Text color="white" fontWeight="medium">
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
        <Text color="white" fontWeight="medium">
          EUR
        </Text>
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
        size="sm"
        variant="link"
        color="red.400"
        fontWeight="semibold"
        w="full"
        onClick={() => {
          ref.current.openModal();
        }}
      >
        Reset Wallet
      </Button>
      <Button
        mt={2}
        size="xs"
        variant="link"
        color="whiteAlpha.600"
        fontWeight="normal"
        w="full"
        onClick={() => {
          setEraseAck(false);
          setErasePhrase('');
          setEraseModalOpen(true);
        }}
      >
        Lost password or reset not working? Erase data on this device
      </Button>
      <Modal
        isOpen={eraseModalOpen}
        onClose={() => {
          if (!eraseBusy) setEraseModalOpen(false);
        }}
        isCentered
        size="sm"
      >
        <ModalOverlay />
        <ModalContent bg="gray.900" color="white" mx={3}>
          <ModalHeader fontSize="md">Erase wallet on this device</ModalHeader>
          <ModalBody>
            <Text fontSize="sm" mb={3}>
              This removes all Lucem data from this browser or extension,
              including accounts and settings. It does not verify your
              password. You will need your recovery phrase to use this wallet
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
            <Text fontSize="xs" color="whiteAlpha.600" mb={1}>
              Type the same phrase as the gray link (spacing and capitalization
              are flexible):
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
                    title: 'Wallet data erased',
                    description: 'Reloading…',
                    status: 'success',
                    duration: 2000,
                  });
                  window.setTimeout(() => {
                    window.location.reload();
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
              Erase all local data
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
      <ConfirmModal
        info={
          <Box mb="4" fontSize="sm" width="full">
            The wallet will be reset.{' '}
            <b>Make sure you have written down your seed phrase.</b> It's the
            only way to recover your current wallet! <br />
            <Text as="span" display="block" mt={3} color="orange.200">
              Enter your <b>wallet password</b> here only. Do not type &quot;Erase
              data on this device&quot; in this box — that is not your password and
              will show &quot;wrong password&quot;. Close this dialog and tap the gray
              &quot;Erase data on this device&quot; link under Reset Wallet instead.
            </Text>
            <Text as="span" display="block" mt={2}>
              A blank password only works if this install used an empty encryption
              password (rare).
            </Text>
          </Box>
        }
        allowEmptyPassword
        ref={ref}
        onCloseBtn={() => {
        }}
        sign={(password) => {
          return resetStorage(password);
        }}
        onConfirm={async (status, signedTx) => {
          if (status === true) {
            ref.current.closeModal();
            toast({
              title: 'Wallet reset',
              description: 'Reloading…',
              status: 'success',
              duration: 2000,
            });
            window.setTimeout(() => {
              window.location.reload();
            }, 250);
          }
        }}
      />
      <ChangePasswordModal ref={changePasswordRef} />
    </Box>
  );
};

const Whitelisted = () => {
  const [whitelisted, setWhitelisted] = React.useState(null);
  const getData = () =>
    getWhitelisted().then((whitelisted) => {
      setWhitelisted(whitelisted);
    });
  React.useEffect(() => {
    getData();
  }, []);
  return (
    <Box w="full" maxW="md" mx="auto" pt={1}>
      <SettingsPageTitle>Whitelisted sites</SettingsPageTitle>
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
                bg="whiteAlpha.50"
                borderWidth="1px"
                borderColor="whiteAlpha.100"
              >
                <Image
                  width="24px"
                  src={platform.icons.getFaviconUrl(origin)}
                  fallback={<SkeletonCircle width="24px" height="24px" />}
                />
                <Text
                  flex="1"
                  color="white"
                  fontSize="sm"
                  fontWeight="medium"
                  isTruncated
                >
                  {origin.split('//')[1]}
                </Text>
                <SmallCloseIcon
                  cursor="pointer"
                  color="whiteAlpha.700"
                  _hover={{ color: 'white' }}
                  onClick={async () => {
                    await removeWhitelisted(origin);
                    getData();
                  }}
                />
              </Flex>
            ))}
          </Flex>
        ) : (
          <Text textAlign="center" color="whiteAlpha.500" py={16} fontSize="sm">
            No whitelisted sites
          </Text>
        )
      ) : (
        <Flex w="full" py={20} align="center" justify="center">
          <Spinner color="yellow" speed="0.5s" />
        </Flex>
      )}
    </Box>
  );
};

const Network = () => {
  const settings = useStoreState((state) => state.settings.settings);
  const setSettings = useStoreActions(
    (actions) => actions.settings.setSettings
  );

  const endpointHandler = (e) => {
    setSettings({
      ...settings,
      network: {
        ...settings.network,
        [settings.network.id + 'Submit']: value,
      },
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 600);
  };

  const [value, setValue] = React.useState(
    settings.network[settings.network.id + 'Submit'] || ''
  );
  const [isEnabled, setIsEnabled] = React.useState(
    settings.network[settings.network.id + 'Submit']
  );

  const [applied, setApplied] = React.useState(false);

  React.useEffect(() => {
    setValue(settings.network[settings.network.id + 'Submit'] || '');
    setIsEnabled(Boolean(settings.network[settings.network.id + 'Submit']));
  }, [settings]);

  return (
    <Box w="full" maxW="sm" mx="auto" pt={1}>
      <SettingsPageTitle>Network</SettingsPageTitle>
      <Select
        w="full"
        rounded="xl"
        bg="gray.900"
        borderColor="whiteAlpha.300"
        color="white"
        mb={6}
        defaultValue={settings.network.id}
        onChange={(e) => {
          const id = e.target.value;
          setSettings({
            ...settings,
            network: {
              ...settings.network,
              id: NETWORK_ID[id],
              node: NODE[id],
            },
          });
        }}
      >
        <option value={NETWORK_ID.mainnet}>Mainnet</option>
        <option value={NETWORK_ID.preprod}>Preprod</option>
        <option value={NETWORK_ID.preview}>Preview</option>
      </Select>
      <Flex align="center" gap={3} mb={4}>
        <Checkbox
          isChecked={isEnabled}
          onChange={(e) => {
            if (!e.target.checked) {
              setSettings({
                ...settings,
                network: {
                  ...settings.network,
                  [settings.network.id + 'Submit']: null,
                },
              });
              setValue('');
            }
            setIsEnabled(e.target.checked);
          }}
          size="md"
        />
        <Text color="white" fontWeight="medium">
          Custom node
        </Text>
      </Flex>
      <InputGroup size="md" w="full">
        <Input
          isDisabled={!isEnabled}
          fontSize="sm"
          rounded="xl"
          {...settingsInputProps}
          value={value}
          placeholder="http://localhost:8090/api/submit/tx"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.length > 0) {
              endpointHandler();
            }
          }}
          onChange={(e) => setValue(e.target.value)}
          pr="4.5rem"
        />
        <InputRightElement width="4.5rem" h="full">
          <Button
            isDisabled={applied || !isEnabled || value.length <= 0}
            h="1.75rem"
            size="sm"
            rounded="md"
            onClick={endpointHandler}
          >
            {applied ? <CheckIcon color={'yellow.400'} /> : 'Apply'}
          </Button>
        </InputRightElement>
      </InputGroup>
    </Box>
  );
};

export default Settings;
