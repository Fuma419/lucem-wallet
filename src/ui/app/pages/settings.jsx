import {
  Box,
  Button,
  IconButton,
  Text,
  useColorMode,
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
  Badge,
  Flex,
} from '@chakra-ui/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SunIcon,
  SmallCloseIcon,
  RepeatIcon,
  CheckIcon,
} from '@chakra-ui/icons';
import React, { useCallback } from 'react';
import platform from '../../../platform';
import {
  getCurrentAccount,
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  getWhitelisted,
  removeWhitelisted,
  resetStorage,
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
        className="lucem-wallet-main-column"
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
          px={{ base: 4, md: 6 }}
          pb={6}
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
  // const { colorMode, toggleColorMode } = useColorMode();
  return (
    <Box w="full" maxW="md" mx="auto" pt={2}>
      <Text fontSize="lg" fontWeight="bold" mb={6}>
        Settings
      </Text>
      <Flex direction="column" gap={1}>
        <Button
          justifyContent="space-between"
          w="full"
          py={6}
          rightIcon={<ChevronRightIcon />}
          variant="ghost"
          onClick={() => {
            navigate('general');
          }}
        >
          General settings
        </Button>
        <Button
          justifyContent="space-between"
          w="full"
          py={6}
          rightIcon={<ChevronRightIcon />}
          variant="ghost"
          onClick={() => {
            navigate('whitelisted');
          }}
        >
          Whitelisted sites
        </Button>
        <Button
          justifyContent="space-between"
          w="full"
          py={6}
          rightIcon={<ChevronRightIcon />}
          variant="ghost"
          onClick={() => {
            navigate('network');
          }}
        >
          Network
        </Button>
        <Button
          justifyContent="space-between"
          w="full"
          py={6}
          rightIcon={<ChevronRightIcon />}
          variant="ghost"
          onClick={() => {
            navigate('legal');
          }}
        >
          Legal
        </Button>
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
    <Box w="full" maxW="md" mx="auto" pt={2}>
      <Text fontSize="lg" fontWeight="bold" mb={4}>
        General settings
      </Text>
      <InputGroup size="md" w="full" maxW="sm">
        <Input
          variant="filled"
          bg="gray.800"
          color="whiteAlpha.900"
          _placeholder={{ color: 'whiteAlpha.600' }}
          onKeyDown={(e) => {
            if (
              e.key == 'Enter' &&
              account.name.length > 0 &&
              account.name != originalName
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
        <InputRightElement width="4.5rem">
          {account.name == originalName ? (
            <Icon mr="-4" as={MdModeEdit} />
          ) : (
            <Button
              isDisabled={account.name.length <= 0}
              h="1.75rem"
              size="sm"
              onClick={nameHandler}
            >
              Apply
            </Button>
          )}
        </InputRightElement>
      </InputGroup>
      <Flex align="center" gap={4} mt={6}>
        <Box w="65px" h="65px" flexShrink={0}>
          <AvatarLoader forceUpdate avatar={account.avatar} width="full" />
        </Box>
        <IconButton
          onClick={() => {
            avatarHandler();
          }}
          rounded="md"
          size="sm"
          aria-label="New avatar"
          icon={<RepeatIcon />}
        />
      </Flex>

      <Flex align="center" gap={2} mt={8} w="full" maxW="sm">
        <Text>USD</Text>
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
        <Text>EUR</Text>
      </Flex>
      <Flex direction="column" gap={3} mt={8} w="full" maxW="sm">
        <Button disabled={refreshed} size="md" w="full" onClick={refreshHandler}>
          Refresh Balance
        </Button>
        <Button
          colorScheme="gray"
          size="md"
          w="full"
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
        colorScheme="red"
        variant="link"
        onClick={() => {
          ref.current.openModal();
        }}
      >
        Reset Wallet
      </Button>
      <ConfirmModal
        info={
          <Box mb="4" fontSize="sm" width="full">
            The wallet will be reset.{' '}
            <b>Make sure you have written down your seed phrase.</b> It's the
            only way to recover your current wallet! <br />
            Type your password below, if you want to continue.
          </Box>
        }
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
              description: 'All data has been cleared.',
              status: 'success',
              duration: 3000,
            });
            navigate('/welcome');
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
    <Box
      width="100%"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
    >
      <Box height="10" />
      <Text fontSize="lg" fontWeight="bold">
        Whitelisted sites
      </Text>
      <Box height="6" />
      {whitelisted ? (
        whitelisted.length > 0 ? (
          whitelisted.map((origin, index) => (
            <Box
              mb="2"
              key={index}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              width="65%"
            >
              <Image
                width="24px"
                src={platform.icons.getFaviconUrl(origin)}
                fallback={<SkeletonCircle width="24px" height="24px" />}
              />
              <Text>{origin.split('//')[1]}</Text>
              <SmallCloseIcon
                cursor="pointer"
                onClick={async () => {
                  await removeWhitelisted(origin);
                  getData();
                }}
              />
            </Box>
          ))
        ) : (
          <Box
            mt="200"
            width="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="GrayText"
          >
            No whitelisted sites
          </Box>
        )
      ) : (
        <Box
          mt="200"
          width="full"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Spinner color="yellow" speed="0.5s" />
        </Box>
      )}

      <Box height="6" />
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
    <>
      <Box height="10" />
      <Text fontSize="lg" fontWeight="bold">
        Network
      </Text>
      <Box height="6" />
      <Box display="flex" alignItems="center" justifyContent="center">
        <Select
          defaultValue={settings.network.id}
          onChange={(e) => {
            switch (e.target.value) {
              case NETWORK_ID.mainnet:
                break;
              case NETWORK_ID.preprod:
                break;
              case NETWORK_ID.preview:
                break;
              default:
                break;
            }

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
      </Box>
      <Box height="8" />
      <Box display="flex" alignItems="center" justifyContent="center">
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
        />{' '}
        <Box width="2" /> <Text>Custom node</Text>
      </Box>
      <Box height="3" />
      <InputGroup size="md" width={'280px'}>
        <Input
          isDisabled={!isEnabled}
          fontSize={'xs'}
          value={value}
          placeholder="http://localhost:8090/api/submit/tx"
          onKeyDown={(e) => {
            if (e.key == 'Enter' && value.length > 0) {
              endpointHandler();
            }
          }}
          onChange={(e) => setValue(e.target.value)}
          pr="4.5rem"
        />
        <InputRightElement width="4.5rem">
          <Button
            isDisabled={applied || !isEnabled || value.length <= 0}
            h="1.75rem"
            size="sm"
            onClick={endpointHandler}
          >
            {applied ? <CheckIcon color={'yellow.400'} /> : 'Apply'}
          </Button>
        </InputRightElement>
      </InputGroup>
    </>
  );
};

export default Settings;
