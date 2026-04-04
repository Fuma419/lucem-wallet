import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createAccount,
  createTab,
  deleteAccount,
  displayUnit,
  getAccounts,
  getCurrentAccount,
  getCurrentAccountIndex,
  getDelegation,
  getNativeAccounts,
  getNetwork,
  getTransactions,
  isHW,
  switchAccount,
  updateAccount,
  getStorage,
} from '../../../api/extension';
import {
  BsArrowDownRight,
  BsArrowUpRight,
  BsClockHistory,
} from 'react-icons/bs';
import {
  Button,
  Box,
  Flex,
  Spacer,
  Stack,
  Text,
  Icon,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Menu,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  Portal,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tooltip,
} from '@chakra-ui/react';
import {
  SettingsIcon,
  AddIcon,
  StarIcon,
  DeleteIcon,
  CopyIcon,
  ChevronDownIcon,
  InfoOutlineIcon,
} from '@chakra-ui/icons';
import { Scrollbars } from '../components/scrollbar';
import QrCode from '../components/qrCode';
import provider from '../../../config/provider';
import UnitDisplay from '../components/unitDisplay';
import { onAccountChange } from '../../../api/extension';
import AssetsViewer from '../components/assetsViewer';
import HistoryViewer from '../components/historyViewer';
import Copy from '../components/copy';
import About from '../components/about';
import { useStoreState } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { currencyToSymbol, fromAssetUnit } from '../../../api/util';
import TransactionBuilder from '../components/transactionBuilder';
import { NETWORK_ID, TAB, STORAGE } from '../../../config/config';
import { FaGamepad, FaRegFileCode } from 'react-icons/fa';
import { RxTokens } from "react-icons/rx";
import { GoHistory } from "react-icons/go";
import { BiWallet } from 'react-icons/bi';
import { GiToken, GiUsbKey } from 'react-icons/gi';
import CollectiblesViewer from '../components/collectiblesViewer';
import AssetFingerprint from '@emurgo/cip14-js';
import { useColorModeValue } from '@chakra-ui/react';

// Assets
import Logo from '../../../assets/img/logo.png';

const useIsMounted = () => {
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => (isMounted.current = false);
  }, []);
  return isMounted;
};

const Wallet = () => {
  const isMounted = useIsMounted();
  const navigate = useNavigate();
  const settings = useStoreState((state) => state.settings.settings);
  const avatarBg = useColorModeValue('yellow.100', 'gray.900');
  const panelBg = useColorModeValue('yellow.100', 'black');
  const receiveButton = useColorModeValue('yellow.100', 'cyan.700');
  const sendButton = useColorModeValue('yellow.500', 'yellow.600');
  const [state, setState] = React.useState({
    account: null,
    accounts: null,
    fiatPrice: 0,
    delegation: null,
    network: { id: '', node: '' },
  });
  const [menu, setMenu] = React.useState(false);
  const newAccountRef = React.useRef();
  const aboutRef = React.useRef();
  const deletAccountRef = React.useRef();
  const [info, setInfo] = React.useState({
    avatar: '',
    name: '',
    paymentAddr: '',
    accounts: {},
  }); // for quicker displaying
  const builderRef = React.useRef();
  const fiatPrice = React.useRef(0);

  const checkTransactions = () =>
    setInterval(async () => {
      const currentAccount = await getCurrentAccount();
      const transactions = await getTransactions();
      const network = await getNetwork();
      if (
        transactions.length > 0 &&
        currentAccount[network.id].lastUpdate !== transactions[0].txHash
      ) {
        await getData();
      }
    }, 10000);

  const getData = async (forceUpdate) => {
    const currentIndex = await getCurrentAccountIndex();
    const accounts = await getAccounts();
    const { avatar, name, index, paymentAddr } = accounts[currentIndex];
    if (!isMounted.current) return;
    setInfo({ avatar, name, currentIndex: index, paymentAddr, accounts });
    setState((s) => ({
      ...s,
      account: null,
      delegation: null,
    }));
    await updateAccount(forceUpdate);
    const allAccounts = await getAccounts();
    const currentAccount = allAccounts[currentIndex];
    currentAccount.ft =
      currentAccount.lovelace > 0
        ? [
            {
              unit: 'lovelace',
              quantity: (
                BigInt(currentAccount.lovelace) -
                BigInt(currentAccount.minAda) -
                BigInt(
                  currentAccount.collateral
                    ? currentAccount.collateral.lovelace
                    : 0
                )
              ).toString(),
            },
          ]
        : [];
    currentAccount.nft = [];
    currentAccount.assets.forEach((asset) => {
      asset.policy = asset.unit.slice(0, 56);
      asset.name = Buffer.from(asset.unit.slice(56), 'hex');
      asset.fingerprint = AssetFingerprint.fromParts(
        Buffer.from(asset.policy, 'hex'),
        asset.name
      ).fingerprint();
      asset.name = asset.name.toString();
      if (
        (asset.has_nft_onchain_metadata === true &&
          !fromAssetUnit(asset.unit).label) ||
        fromAssetUnit(asset.unit).label === 222
      )
        currentAccount.nft.push(asset);
      else currentAccount.ft.push(asset);
    });
    let price = fiatPrice.current;
    try {
      if (!fiatPrice.current) {
        price = await provider.api.price(settings.currency);
        fiatPrice.current = price;
      }
    } catch (e) {}
    const network = await getNetwork();
    const delegation = await getDelegation();
    if (!isMounted.current) return;
    setState((s) => ({
      ...s,
      account: currentAccount,
      accounts: allAccounts,
      fiatPrice: price,
      network,
      delegation,
    }));
  };

  React.useEffect(() => {
    let accountChangeHandler;
    let txInterval;
    getData().then(() => {
      if (!isMounted.current) return;
      txInterval = checkTransactions();
      accountChangeHandler = onAccountChange(() => getData());
    }).catch((e) => {
      console.error('Failed to load account data:', e);
      if (!isMounted.current) return;
      getAccounts().then((accounts) => {
        getCurrentAccountIndex().then((currentIndex) => {
          if (!isMounted.current) return;
          const currentAccount = accounts[currentIndex];
          setState((s) => ({ ...s, account: currentAccount }));
        });
      }).catch(() => {});
    });
    return () => {
      clearInterval(txInterval);
      accountChangeHandler && accountChangeHandler.remove();
    };
  }, []);

  return (
    <>
      <Box
        minHeight="100vh"
        display="flex"
        alignItems="center"
        flexDirection="column"
      >
        <Box
          minHeight="52"
          background={panelBg}
          shadow="md"
          width="full"
          maxWidth="100%"
          position="relative"
          overflow="hidden"
          pb="14"
        >
          {/* Upper row: identical circular frames, symmetric insets (flex beats absolute for mobile alignment) */}
          <Flex
            zIndex="2"
            position="relative"
            w="full"
            maxW="100%"
            pt="max(1.25rem, env(safe-area-inset-top, 0px))"
            pb={2}
            px={{ base: 4, md: 5 }}
            align="center"
            justify="space-between"
            flexShrink={0}
          >
            <Box
              boxSize="14"
              minW="14"
              minH="14"
              rounded="full"
              overflow="hidden"
              flexShrink={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="blackAlpha.500"
            >
              <Image
                draggable={false}
                src={Logo}
                alt=""
                boxSize="full"
                objectFit="cover"
              />
            </Box>
            <Box
              boxSize="14"
              minW="14"
              minH="14"
              rounded="full"
              overflow="hidden"
              flexShrink={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg={avatarBg}
            >
              <AvatarLoader avatar={info.avatar} width="100%" />
            </Box>
          </Flex>

          {/* Lower right settings button */}
          <Box zIndex="2" position="fixed" bottom="7" right="7">
            <Menu
              isOpen={menu}
              autoSelect={false}
              onClose={() => setMenu(false)}
            >
              <MenuButton
                as={Button}
                onClick={() => setMenu(true)}
                className="button settings"
                size="sm"
                background="purple.500"
                rounded="lg"
                shadow="md"
                w="35px"
                h="35px"
                p={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <SettingsIcon boxSize={4}/>
              </MenuButton>
              <MenuList fontSize="md">
                <MenuGroup title="Accounts">
                  <Scrollbars
                    style={{ width: '100%' }}
                    autoHeight
                    autoHeightMax={210}
                  >
                    {Object.keys(info.accounts).map((accountIndex) => {
                      const accountInfo = info.accounts[accountIndex];
                      const account =
                        state.accounts && state.accounts[accountIndex];
                      return (
                        <MenuItem
                          isDisabled={!state.account}
                          position="relative"
                          key={accountIndex}
                          onClick={async (e) => {
                            if (
                              info.currentIndex === accountInfo.index ||
                              !state.account
                            ) {
                              return;
                            }
                            await switchAccount(accountIndex);
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            width="full"
                          >
                            <Box
                              width={'30px'}
                              height={'30px'}
                              mr="12px"
                              display={'flex'}
                              alignItems={'center'}
                              justifyContent={'center'}
                            >
                              <AvatarLoader
                                avatar={accountInfo.avatar}
                                width={'30px'}
                              />
                            </Box>

                            <Box
                              display="flex"
                              alignItems="center"
                              width="full"
                            >
                              <Box display="flex" flexDirection="column">
                                <Box height="1.5" />
                                <Text
                                  mb="-1"
                                  fontWeight="bold"
                                  fontSize="14px"
                                  isTruncated={true}
                                  maxWidth="210px"
                                >
                                  {accountInfo.name}
                                </Text>
                                {account ? (
                                  account[state.network.id].lovelace ||
                                  account[state.network.id].lovelace == 0 ? (
                                    <UnitDisplay
                                      quantity={
                                        account &&
                                        account[state.network.id].lovelace &&
                                        (
                                          BigInt(
                                            account[state.network.id].lovelace
                                          ) -
                                          BigInt(
                                            account[state.network.id].minAda
                                          ) -
                                          BigInt(
                                            account[state.network.id]
                                              .collateral
                                              ? account[state.network.id]
                                                  .collateral.lovelace
                                              : 0
                                          )
                                        ).toString()
                                      }
                                      decimals={6}
                                      symbol={settings.adaSymbol}
                                    />
                                  ) : (
                                    <Text fontWeight="light">
                                      Select to load...
                                    </Text>
                                  )
                                ) : (
                                  <Text>...</Text>
                                )}
                              </Box>
                              {info.currentIndex === accountInfo.index && (
                                <>
                                  <Box width="4" />
                                  <StarIcon />
                                  <Box width="4" />
                                </>
                              )}
                              {isHW(accountInfo.index) && (
                                <Box ml="auto" mr="2">
                                  HW
                                </Box>
                              )}
                            </Box>
                          </Stack>
                        </MenuItem>
                      );
                    })}
                  </Scrollbars>
                </MenuGroup>
                <MenuDivider />

                <MenuItem
                  icon={<AddIcon />}
                  onClick={() => {
                    newAccountRef.current.openModal();
                  }}
                >
                  New Account
                </MenuItem>
                {state.account &&
                  state.accounts &&
                  (isHW(state.account.index) ||
                    state.account.index >=
                      Object.keys(getNativeAccounts(state.accounts)).length -
                        1) &&
                  Object.keys(state.accounts).length > 1 && (
                    <MenuItem
                      color="red.300"
                      icon={<DeleteIcon />}
                      onClick={() => {
                        deletAccountRef.current.openModal();
                      }}
                    >
                      Delete Account
                    </MenuItem>
                  )}
                <MenuItem
                  icon={<Icon as={GiUsbKey} w={3} h={3} />}
                  onClick={() => {
                    createTab(TAB.hw);
                  }}
                >
                  Connect Hardware Wallet
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  icon={<Icon as={FaRegFileCode} w={3} h={3} />}
                  onClick={() => {
                    builderRef.current.initCollateral(state.account);
                  }}
                >
                  {' '}
                  Collateral
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  onClick={() => navigate('/settings')}
                  icon={<SettingsIcon />}
                >
                  Settings
                </MenuItem>
                <MenuItem onClick={() => aboutRef.current.openModal()}>
                  About
                </MenuItem>
              </MenuList>
            </Menu>
          </Box>

          <Box
            zIndex="1"
            position="absolute"
            width="full"
            top={{
              base:
                'calc(max(1.25rem, env(safe-area-inset-top, 0px)) + 3.5rem + 0.35rem)',
              md: 8,
            }}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text
              className="lineClamp"
              fontSize="xl"
              isTruncated={true}
              maxWidth="210px"
            >
              {info.name}
            </Text>
          </Box>
          <Box
            position="absolute"
            width="full"
            height="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <UnitDisplay
              className="lineClamp"
              fontSize="2xl"
              fontWeight="bold"
              quantity={
                state.account &&
                (state.account.lovelace || state.account.lovelace === 0 || state.account.lovelace === '0')
                  ? (
                    BigInt(state.account.lovelace) -
                    BigInt(state.account.minAda) -
                    BigInt(
                      state.account.collateral
                        ? state.account.collateral.lovelace
                        : 0
                    )
                  ).toString()
                  : undefined
              }
              decimals={6}
              symbol={settings.adaSymbol}
            />
            {state.account &&
            (state.account.assets.length > 0 || state.account.collateral) ? (
              <Tooltip
                label={
                  <Box display="flex" flexDirection="column">
                    {state.account.assets.length > 0 && (
                      <Box>
                        <Box display="flex">
                          <Text mr="0.5">+</Text>
                          <UnitDisplay
                            quantity={state.account.minAda}
                            symbol={settings.adaSymbol}
                            decimals={6}
                          />
                          <Text ml="1">locked with assets</Text>
                        </Box>
                      </Box>
                    )}
                    {state.account.collateral && (
                      <Box>
                        <Box display="flex">
                          <Text mr="0.5">+</Text>
                          <UnitDisplay
                            quantity={state.account.collateral.lovelace}
                            symbol={settings.adaSymbol}
                            decimals={6}
                          />
                          <Text ml="1">Collateral</Text>
                        </Box>
                      </Box>
                    )}
                  </Box>
                }
                fontSize="sm"
                hasArrow
                placement="auto"
              >
                <InfoOutlineIcon
                  cursor="help"
                  color="white"
                  ml="10px"
                  width="14px"
                  height="14px"
                  display="inline-block"
                />
              </Tooltip>
            ) : (
              ''
            )}
          </Box>
          <Box
            bottom="46px"
            position="absolute"
            width="full"
            maxWidth="100%"
            px={2}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <UnitDisplay
              className="lineClamp"
              fontSize="md"
              quantity={
                state.account &&
                state.account.lovelace &&
                parseInt(
                  displayUnit(
                    (
                      BigInt(state.account.lovelace) -
                      BigInt(state.account.minAda) -
                      BigInt(
                        state.account.collateral
                          ? state.account.collateral.lovelace
                          : 0
                      )
                    ).toString()
                  ) *
                    state.fiatPrice *
                    10 ** 2
                )
              }
              symbol={currencyToSymbol(settings.currency)}
              decimals={2}
            />
          </Box>

          {/* Receive, delegation, Send — one flex row (wraps on very narrow widths) */}
          <Box
            display="flex"
            flexWrap="wrap"
            justifyContent="center"
            alignItems="center"
            alignContent="center"
            position="absolute"
            bottom="2"
            left="50%"
            transform="translateX(-50%)"
            gap={{ base: 2, sm: 3, md: 6 }}
            width="calc(100% - 16px)"
            maxWidth="100%"
            px={2}
            zIndex={2}
          >
          <Popover>
            <PopoverTrigger>
              <Button
                data-testid="wallet-receive"
                className="button hw-wallet"
                background={receiveButton}
                rightIcon={<Icon as={BsArrowDownRight} />}
                size="sm"
                rounded="lg"
                shadow="md"
                flexShrink={0}
                onClick={() => {
                }}
              >
                Receive
              </Button>
            </PopoverTrigger>
            <Portal>
              <PopoverContent width="70">
                <PopoverArrow />
                <PopoverBody
                  mt="5"
                  alignItems="center"
                  justifyContent="center"
                  display="flex"
                  flexDirection="column"
                  textAlign="center"
                >
                  <>
                    <Box>
                      <QrCode value={info.paymentAddr} />
                    </Box>
                    <Box height="4" />
                    <Copy
                      label="Copied address"
                      copy={info.paymentAddr}
                      onClick={() => {
                      }}
                    >
                      <Text
                        maxWidth="250px"
                        fontSize="xs"
                        lineHeight="1.2"
                        cursor="pointer"
                        wordBreak="break-all"
                      >
                        {info.paymentAddr} <CopyIcon />
                      </Text>
                    </Copy>
                    <Box height="2" />
                  </>
                </PopoverBody>
              </PopoverContent>
            </Portal>
          </Popover>

            {state.delegation && (
              <Box
                data-testid="wallet-delegation"
                flex="0 1 auto"
                minW={0}
                maxW={{ base: '9rem', sm: '11rem' }}
                display="flex"
                justifyContent="center"
                alignItems="center"
              >
                {state.delegation.active ? (
                  <DelegationPopover
                    account={state.account}
                    delegation={state.delegation}
                  >
                    {state.delegation.ticker ||
                      state.delegation.poolId.slice(-9)}
                  </DelegationPopover>
                ) : (
                  <Button
                    onClick={() => {
                      builderRef.current.initDelegation(
                        state.account,
                        state.delegation
                      );
                    }}
                    variant="solid"
                    size="sm"
                    rounded="lg"
                    flexShrink={0}
                  >
                    Delegate
                  </Button>
                )}
              </Box>
            )}

            <Button
              data-testid="wallet-send"
              onClick={() => {
                navigate('/send');
              }}
              className="button import-wallet"
              size="sm"
              background={sendButton}
              rounded="lg"
              rightIcon={<Icon as={BsArrowUpRight} />}
              shadow="md"
              flexShrink={0}
            >
              Send
            </Button>
          </Box>
        </Box>
        <Box height="8" />
        <Tabs
          isLazy={true}
          lazyBehavior="unmount"
          width="full"
          alignItems="center"
          display="flex"
          flexDirection="column"
          variant="soft-rounded"
          colorScheme="customGray"
        >
          <TabList>
            <Tab mr={2}>
              <Icon as={GiToken} boxSize={5} />
            </Tab>
            <Tab
              mr={2}
              onClick={() => {
              }}
            >
              <Icon as={RxTokens} boxSize={5} />
            </Tab>
            <Tab>
              <Icon
                as={GoHistory}
                boxSize={5}
                onClick={() => {
                }}
              />
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <AssetsViewer assets={state.account && state.account.ft} />
            </TabPanel>
            <TabPanel>
              <CollectiblesViewer
                assets={state.account && state.account.nft}
                onUpdateAvatar={() => getData()}
              />
            </TabPanel>
            <TabPanel>
              <HistoryViewer
                network={state.network}
                history={state.account && state.account.history}
                currentAddr={state.account && state.account.paymentAddr}
                addresses={
                  state.accounts &&
                  Object.keys(state.accounts).map(
                    (index) => state.accounts[index].paymentAddr
                  )
                }
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
      <NewAccountModal ref={newAccountRef} />
      <DeleteAccountModal
        name={state.account && state.account.name}
        ref={deletAccountRef}
      />
      <TransactionBuilder
        ref={builderRef}
        onConfirm={(forceUpdate) => getData(forceUpdate)}
      />
      <About ref={aboutRef} />
    </>
  );
};

const NewAccountModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isLoading, setIsLoading] = React.useState(false);
  const [state, setState] = React.useState({
    password: '',
    show: false,
    name: '',
  });

  const confirmHandler = async () => {
    setIsLoading(true);
    try {
      const index = await createAccount(state.name, state.password);
      await switchAccount(index);
      onClose();
    } catch (e) {
      console.error('Error creating account:', e);
      setState((s) => ({ ...s, wrongPassword: true }));
    } finally {
      setIsLoading(false);
    }
  };

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));

  React.useEffect(() => {
    if (isOpen) {
      setState({
        password: '',
        show: false,
        name: '',
        wrongPassword: false,
      });
    }
  }, [isOpen]);

  return (
    <Modal
      size="xs"
      isOpen={isOpen}
      onClose={() => {
        onClose();
      }}
      isCentered
    >
      <ModalOverlay />
      <ModalContent className='modal-glow-purple'>
        <ModalHeader fontSize="md">
          {' '}
          <Box display="flex" alignItems="center">
            <Icon as={BiWallet} mr="2" /> <Box>Create new account</Box>
          </Box>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody px="10">
          <Input
            autoFocus={true}
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value, wrongPassword: false }))}
            placeholder="Enter account name"
            _focus={{
              borderColor: 'rgba(220, 27, 250, 0.75)',
              boxShadow: '0 0 0 1px rgba(220, 27, 250, 0.75)'
            }}
          />
          <Spacer height="4" />
          <InputGroup size="md">
            <Input
              variant="filled"
              isInvalid={state.wrongPassword === true}
              pr="4.5rem"
              type={state.show ? 'text' : 'password'}
              value={state.password}
              onChange={(e) =>
                setState((s) => ({ ...s, password: e.target.value, wrongPassword: false }))
              }
              placeholder="Enter password"
              onKeyDown={(e) => {
                if (e.key == 'Enter') confirmHandler();
              }}
              _focus={{
                borderColor: 'rgba(220, 27, 250, 0.75)',
                boxShadow: '0 0 0 1px rgba(220, 27, 250, 0.75)'
              }}
            />
            <InputRightElement width="4.5rem">
              <Button
                h="1.75rem"
                size="sm"
                onClick={() => setState((s) => ({ ...s, show: !s.show }))}
              >
                {state.show ? 'Hide' : 'Show'}
              </Button>
            </InputRightElement>
          </InputGroup>
          {state.wrongPassword === true && (
            <Text color="red.300">Password is wrong</Text>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            mr={3}
            variant="ghost"
            onClick={() => {
              onClose();
            }}
          >
            Close
          </Button>
          <Button
            isDisabled={!state.password || !state.name || isLoading}
            isLoading={isLoading}
            className="button new-account"
            size="sm"
            background="purple.500"
            rounded="lg"
            shadow="md"
            onClick={confirmHandler}
          >
            Create
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

const DeleteAccountModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isLoading, setIsLoading] = React.useState(false);
  const cancelRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));

  return (
    <AlertDialog
      size="xs"
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="md" fontWeight="bold">
            Delete current account
          </AlertDialogHeader>

          <AlertDialogBody>
            <Text fontSize="sm">
              Are you sure you want to delete <b>{props.name}</b>?
            </Text>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose} mr={3}>
              Cancel
            </Button>
            <Button
              isDisabled={isLoading}
              isLoading={isLoading}
              colorScheme="red"
              onClick={async () => {
                setIsLoading(true);
                await deleteAccount();
                await switchAccount(0);
                onClose();
                setIsLoading(false);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
});

const DelegationPopover = ({ account, delegation, children }) => {
  const settings = useStoreState((state) => state.settings.settings);
  const withdrawRef = React.useRef();
  return (
    <>
      <Popover offset={[80, 8]}>
        <PopoverTrigger>
          <Button
            className="lineClamp"
            style={{
              all: 'revert',
              background: 'none',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '100%',
            }}
            onClick={() => {
            }}
            rightIcon={<ChevronDownIcon />}
          >
            <Text as="span" isTruncated maxW="100%">
              {children}
            </Text>
          </Button>
        </PopoverTrigger>
        <PopoverContent width="60">
          <PopoverArrow />
          <PopoverCloseButton />
          <PopoverBody
            mt="2"
            alignItems="center"
            justifyContent="center"
            display="flex"
            flexDirection="column"
            textAlign="center"
            background="black"
            border="black"
          >
            <Text
              fontWeight="bold"
              fontSize="md"
              textDecoration="underline"
              cursor="pointer"
              onClick={() => window.open(delegation.homepage)}
            >
              {delegation.ticker}
            </Text>
            <Box h="2" />
            <Text fontWeight="light" fontSize="xs">
              {delegation.description}
            </Text>
            <Box h="3" />
            <Text fontSize="xs">Available rewards:</Text>
            <UnitDisplay
              hide
              fontWeight="bold"
              fontSize="sm"
              quantity={delegation.rewards}
              decimals={6}
              symbol={settings.adaSymbol}
            />
            <Box h="4" />
            <Tooltip
              placement="top"
              isDisabled={BigInt(delegation.rewards) >= BigInt('2000000')}
              label="2 ADA minimum"
            >
              <span>
                <Button
                  onClick={() =>
                    withdrawRef.current.initWithdrawal(account, delegation)
                  }
                  isDisabled={BigInt(delegation.rewards) < BigInt('2000000')}
                  size="sm"
                >
                  Withdraw
                </Button>
              </span>
            </Tooltip>
            <Button
              onClick={() => {
                withdrawRef.current.initUndelegate(account, delegation);
              }}
              mt="10px"
              colorScheme="red"
              size="xm"
              variant="link"
            >
              Unstake
            </Button>
            <Box h="2" />
          </PopoverBody>
        </PopoverContent>
      </Popover>
      <TransactionBuilder ref={withdrawRef} />
    </>
  );
};

export default Wallet;
