import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createAccount,
  createTab,
  deleteAccount,
  displayUnit,
  getAccounts,
  getCurrentAccountIndex,
  getDelegation,
  getNativeAccounts,
  getNetwork,
  isHW,
  switchAccount,
  updateAccount,
  getStorage,
} from '../../../api/extension';
import { bigIntLovelace } from '../../../api/lovelace-scalar';
import {
  BsArrowDownRight,
  BsArrowUpRight,
} from 'react-icons/bs';
import {
  Button,
  Box,
  Flex,
  Stack,
  Text,
  Icon,
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
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import {
  SettingsIcon,
  AddIcon,
  StarIcon,
  DeleteIcon,
  CopyIcon,
  ChevronRightIcon,
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
import { useStoreState, useStoreActions } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { currencyToSymbol, fromAssetUnit } from '../../../api/util';
import TransactionBuilder from '../components/transactionBuilder';
import { NETWORK_ID, TAB, STORAGE, NODE } from '../../../config/config';
import { isMidnightNetworkId } from '../../../config/network';
import { fetchMidnightPreviewTip } from '../../../api/midnight-indexer';
import { FaGamepad, FaRegFileCode } from 'react-icons/fa';
import { RxTokens } from "react-icons/rx";
import { GoHistory } from "react-icons/go";
import { GiToken } from 'react-icons/gi';
import { MdHowToVote, MdOutlineHowToReg } from 'react-icons/md';
import CollectiblesViewer from '../components/collectiblesViewer';
import AssetFingerprint from '@emurgo/cip14-js';
import { useColorMode, useColorModeValue } from '@chakra-ui/react';

// Assets
import Logo from '../../../assets/img/logo.png';

/**
 * Root cause of “smaller Lucem orb”: `logo.png` packs most of its bounding box in soft glow +
 * transparency; the salient black disc is much smaller than the file edges. Wallet avatars are
 * DiceBear (or uploads) drawn under `background-size: cover`, so they read to the circular clip.
 * Matching only outer `boxSize` never equalizes perceived size. Fix: render the logo with the
 * same CSS pipeline as avatars (`background-*`) and overscan with a larger `background-size` so
 * the luminous ring + disc fill the clip like avatar art. Tune if the asset changes.
 */
const WALLET_HEADER_LOGO_BG_SIZE = '138%';

const walletHeaderOrbShellProps = {
  boxSize: { base: '12', sm: '13', md: '14' },
  minW: { base: '12', sm: '13', md: '14' },
  minH: { base: '12', sm: '13', md: '14' },
  rounded: 'full',
  overflow: 'hidden',
  flexShrink: 0,
};

const walletFloatingActionButtonProps = {
  className: 'button settings',
  background: 'purple.500',
  rounded: 'full',
  shadow: 'md',
  boxSize: { base: '12', sm: '13', md: '14' },
  minW: { base: '12', sm: '13', md: '14' },
  minH: { base: '12', sm: '13', md: '14' },
  p: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

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
  const setSettings = useStoreActions((actions) => actions.settings.setSettings);

  const toggleNetwork = () => {
    let nextId = NETWORK_ID.mainnet;
    if (settings.network.id === NETWORK_ID.mainnet) nextId = NETWORK_ID.preprod;
    else if (settings.network.id === NETWORK_ID.preprod) nextId = NETWORK_ID.preview;
    else if (settings.network.id === NETWORK_ID.preview)
      nextId = NETWORK_ID.midnight_preview;
    else if (settings.network.id === NETWORK_ID.midnight_preview)
      nextId = NETWORK_ID.mainnet;
    else nextId = NETWORK_ID.mainnet;
    
    setSettings({
      ...settings,
      network: {
        ...settings.network,
        id: nextId,
        node: NODE[nextId],
      },
    });

    setTimeout(() => {
      getData();
    }, 100);
  };
  const { colorMode } = useColorMode();
  const avatarBg = useColorModeValue('gray.100', 'gray.900');
  const panelBg = useColorModeValue('gray.100', 'black');
  /** Light: solid brand tints; dark: filled cyan / gradient class handles Send. */
  const receiveButton = useColorModeValue('cyan.500', 'cyan.700');
  const sendButton = useColorModeValue('purple.500', 'yellow.600');
  const receiveBtnClass =
    colorMode === 'dark' ? 'button import-wallet' : undefined;
  const sendBtnClass = colorMode === 'dark' ? 'button new-wallet' : undefined;
  const actionBtnColor = 'white';
  const [isFetching, setIsFetching] = React.useState(false);
  const [state, setState] = React.useState({
    account: null,
    accounts: null,
    fiatPrice: 0,
    delegation: null,
    network: { id: '', node: '' },
  });
  const [menu, setMenu] = React.useState(false);
  const aboutRef = React.useRef();
  const deletAccountRef = React.useRef();
  const refreshTimeoutRef = React.useRef(null);
  const [info, setInfo] = React.useState({
    avatar: '',
    name: '',
    paymentAddr: '',
    accounts: {},
  }); // for quicker displaying
  const builderRef = React.useRef();
  const fiatPrice = React.useRef(0);
  const [midnightTip, setMidnightTip] = React.useState(null);

  React.useEffect(() => {
    if (settings?.network?.id !== NETWORK_ID.midnight_preview) {
      setMidnightTip(null);
      return undefined;
    }
    const controller = new AbortController();
    fetchMidnightPreviewTip(controller.signal)
      .then((tip) => {
        setMidnightTip(tip);
      })
      .catch(() => setMidnightTip(null));
    return () => controller.abort();
  }, [settings?.network?.id]);

  const getData = async ({ forceUpdate = false, skipUpdate = false } = {}) => {
    setIsFetching(true);
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
    if (!skipUpdate) {
      await updateAccount(forceUpdate);
    }
    const allAccounts = await getAccounts();
    const currentAccount = allAccounts[currentIndex];
    const totalAda = bigIntLovelace(currentAccount.lovelace);
    currentAccount.ft =
      totalAda > 0n
        ? [
            {
              unit: 'lovelace',
              quantity: (
                totalAda -
                bigIntLovelace(currentAccount.minAda) -
                bigIntLovelace(currentAccount.collateral?.lovelace)
              ).toString(),
            },
          ]
        : [];
    currentAccount.nft = [];
    currentAccount.assets.forEach((asset) => {
      try {
        if (!asset || typeof asset.unit !== 'string' || asset.unit.length < 56) {
          return;
        }
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
      } catch (err) {
        console.warn('Skipping malformed asset row', asset?.unit, err);
      }
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
    setIsFetching(false);
  };

  const schedulePostTxRefresh = (delayMs = 30000) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      getData({ forceUpdate: true });
    }, delayMs);
  };

  React.useEffect(() => {
    let accountChangeHandler;
    getData().then(() => {
      if (!isMounted.current) return;
      accountChangeHandler = onAccountChange(() => getData({ skipUpdate: true }));
    }).catch((e) => {
      setIsFetching(false);
      console.error('Failed to load account data:', e);
      if (!isMounted.current) return;
      getAccounts().then((accounts) => {
        getCurrentAccountIndex().then((currentIndex) => {
          if (!isMounted.current) return;
          const currentAccount = accounts[currentIndex];
          if (currentAccount) {
            currentAccount.ft = currentAccount.ft ?? [];
            currentAccount.nft = currentAccount.nft ?? [];
          }
          setState((s) => ({ ...s, account: currentAccount }));
        });
      }).catch(() => {});
    });
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      accountChangeHandler && accountChangeHandler.remove();
    };
  }, []);

  return (
    <>
      <Box
        minH="100vh"
        sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
        display="flex"
        alignItems="stretch"
        flexDirection="column"
        w="full"
        maxW="100%"
      >
        <Box className="lucem-wallet-main-column" flex="1" display="flex" flexDirection="column">
        <Box
          background={panelBg}
          shadow="md"
          width="full"
          maxWidth="100%"
          position="relative"
          overflow="visible"
          pb={{ base: 4, md: 6 }}
        >
          {/* Icon row — flow layout (no absolute stacking over balance). */}
          <Flex
            zIndex={2}
            w="full"
            maxW="100%"
            pt={{ base: 3, md: 4 }}
            pb={2}
            px={{ base: 4, md: 5 }}
            align="center"
            justify="space-between"
            flexShrink={0}
          >
            <Box
              {...walletHeaderOrbShellProps}
              role="img"
              aria-label="Lucem"
              bg="blackAlpha.500"
              backgroundImage={`url(${Logo})`}
              backgroundRepeat="no-repeat"
              backgroundPosition="50% 50%"
              backgroundSize={`${WALLET_HEADER_LOGO_BG_SIZE} ${WALLET_HEADER_LOGO_BG_SIZE}`}
            />
            <Box {...walletHeaderOrbShellProps} bg={avatarBg} position="relative">
              <Box position="absolute" inset={0}>
                <AvatarLoader avatar={info.avatar} width="100%" />
              </Box>
            </Box>
          </Flex>

          {isMidnightNetworkId(settings.network.id) ? (
            <Alert
              status="info"
              variant="subtle"
              mx={{ base: 3, md: 4 }}
              mb={3}
              rounded="md"
              fontSize="sm"
            >
              <AlertIcon />
              <Box>
                <AlertTitle fontSize="sm">Midnight Preview (testnet-class)</AlertTitle>
                <AlertDescription fontSize="xs">
                  This is a separate chain from Cardano L1. Your existing Lucem seed still controls your Cardano accounts only;
                  native Midnight keys and transfers are not wired up yet (that needs Midnight SDK work). Use Cardano networks for ADA.{' '}
                  {midnightTip ? (
                    <>
                      Blockfrost indexer: height {midnightTip.height}
                      {midnightTip.hash
                        ? ` · ${String(midnightTip.hash).slice(0, 12)}…`
                        : ''}
                      .
                    </>
                  ) : (
                    <>
                      Set env{' '}
                      <Text as="span" fontFamily="mono" fontSize="xs">
                        BLOCKFROST_MIDNIGHT_PROJECT_ID_PREVIEW
                      </Text>{' '}
                      (from blockfrost.io Midnight project) to load live tip here.
                    </>
                  )}
                </AlertDescription>
              </Box>
            </Alert>
          ) : null}

          {/* Lower left delegation — respect safe area on notched devices */}
          {state.delegation && !isMidnightNetworkId(settings.network.id) && (
            <Box
              data-testid="wallet-delegation"
              zIndex={2}
              position="fixed"
              bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
              left="calc(env(safe-area-inset-left, 0px) + 1.5rem)"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap={2}
            >
              <Tooltip label="Vote" hasArrow>
                <Button
                  {...walletFloatingActionButtonProps}
                  onClick={() => navigate('/governance')}
                  aria-label="Open voting"
                >
                  <Icon as={MdHowToVote} boxSize={6} />
                </Button>
              </Tooltip>
              {state.delegation.active ? (
                <DelegationPopover
                  account={state.account}
                  delegation={state.delegation}
                  label={state.delegation.ticker || state.delegation.poolId.slice(-9)}
                />
              ) : (
                <Tooltip label="Delegate" hasArrow>
                  <Button
                    {...walletFloatingActionButtonProps}
                    onClick={() => {
                      builderRef.current.initDelegation(
                        state.account,
                        state.delegation
                      );
                    }}
                    aria-label="Delegate stake"
                  >
                    <Icon as={MdOutlineHowToReg} boxSize={6} />
                  </Button>
                </Tooltip>
              )}
            </Box>
          )}

          {/* Network Switcher — center aligned */}
          {/* Network Switcher — center aligned */}
          <Box
            zIndex={2}
            position="fixed"
            bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
            left="50%"
            transform="translateX(-50%)"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Button
              w="120px"
              className={`button network-${settings.network.id} ${isFetching ? 'is-loading' : ''}`}
              size="sm"
              rounded="lg"
              shadow="none"
              flexShrink={0}
              onClick={toggleNetwork}
            >
              {settings.network.id === NETWORK_ID.mainnet
                ? 'Mainnet'
                : settings.network.id === NETWORK_ID.preprod
                ? 'Preprod'
                : settings.network.id === NETWORK_ID.preview
                ? 'Preview'
                : settings.network.id === NETWORK_ID.midnight_preview
                ? 'Midnight'
                : 'Testnet'}
            </Button>
          </Box>

          {/* Lower right settings — respect safe area on notched devices */}
          <Box
            zIndex={2}
            position="fixed"
            bottom="calc(env(safe-area-inset-bottom, 0px) + 1.5rem)"
            right="calc(env(safe-area-inset-right, 0px) + 1.5rem)"
          >
            <Menu
              isOpen={menu}
              autoSelect={false}
              onOpen={() => setMenu(true)}
              onClose={() => setMenu(false)}
            >
              <MenuButton
                as={Button}
                {...walletFloatingActionButtonProps}
              >
                <SettingsIcon boxSize={6} />
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
                                  account[state.network.id].lovelace !== null &&
                                  account[state.network.id].lovelace !==
                                    undefined ? (
                                    <UnitDisplay
                                      quantity={(
                                        bigIntLovelace(
                                          account[state.network.id].lovelace
                                        ) -
                                        bigIntLovelace(
                                          account[state.network.id].minAda
                                        ) -
                                        bigIntLovelace(
                                          account[state.network.id].collateral
                                            ?.lovelace
                                        )
                                      ).toString()}
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
                    navigate('/welcome');
                  }}
                >
                  New Wallet
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
                <MenuDivider />
                <MenuItem
                  icon={<Icon as={FaRegFileCode} w={3} h={3} />}
                  isDisabled={isMidnightNetworkId(settings.network.id)}
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

          <Box px={{ base: 3, md: 4 }} pb={1} flexShrink={0} textAlign="center">
            <Text
              className="lineClamp"
              fontSize={{ base: 'lg', md: 'xl' }}
              isTruncated={true}
              maxW="min(280px, 85vw)"
              mx="auto"
            >
              {info.name}
            </Text>
          </Box>

          <Flex
            direction="column"
            align="center"
            justify="center"
            py={{ base: 2, md: 4 }}
            px={2}
            flexShrink={0}
            gap={1}
          >
            <Flex align="center" justify="center" flexWrap="wrap" gap={1}>
              {isMidnightNetworkId(settings.network.id) ? (
                <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="bold" color="gray.300">
                  Cardano balance not shown on Midnight
                </Text>
              ) : (
              <UnitDisplay
                className="lineClamp"
                fontSize={{ base: 'xl', md: '2xl' }}
                fontWeight="bold"
                quantity={
                  state.account &&
                  state.account.lovelace !== null &&
                  state.account.lovelace !== undefined
                    ? (
                        bigIntLovelace(state.account.lovelace) -
                        bigIntLovelace(state.account.minAda) -
                        bigIntLovelace(
                          state.account.collateral?.lovelace
                        )
                      ).toString()
                    : undefined
                }
                decimals={6}
                symbol={settings.adaSymbol}
              />
              )}
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
                              quantity={bigIntLovelace(
                                state.account.collateral.lovelace
                              ).toString()}
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
            </Flex>
            {!isMidnightNetworkId(settings.network.id) ? (
            <UnitDisplay
              className="lineClamp"
              fontSize="md"
              quantity={
                state.account &&
                state.account.lovelace !== null &&
                state.account.lovelace !== undefined &&
                parseInt(
                  displayUnit(
                    (
                      bigIntLovelace(state.account.lovelace) -
                      bigIntLovelace(state.account.minAda) -
                      bigIntLovelace(
                        state.account.collateral?.lovelace
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
            ) : null}
          </Flex>

          {/* Receive, delegation, Send — flows under balance (no overlap). */}
          <Flex
            flexWrap="wrap"
            justifyContent="center"
            alignItems="center"
            alignContent="center"
            gap={{ base: 8, sm: 12, md: 16 }}
            w="full"
            maxW="100%"
            px={{ base: 2, md: 3 }}
            py={{ base: 3, md: 4 }}
            flexShrink={0}
          >
          <Box flex={1} display="flex" justifyContent="flex-end">
            <Popover isLazy>
              <PopoverTrigger>
                <Button
                  w="120px"
                  data-testid="wallet-receive"
                  className={receiveBtnClass}
                  color={actionBtnColor}
                  background={receiveButton}
                  _hover={
                    colorMode === 'light' ? { bg: 'cyan.600' } : undefined
                  }
                  rightIcon={<Icon as={BsArrowDownRight} />}
                  size="sm"
                  rounded="lg"
                  shadow="md"
                  flexShrink={0}
                  isDisabled={isMidnightNetworkId(settings.network.id)}
                  title={
                    isMidnightNetworkId(settings.network.id)
                      ? 'Cardano receive only—switch to Mainnet, Preprod, or Preview'
                      : undefined
                  }
                  onClick={() => {}}
                >
                  Receive
                </Button>
              </PopoverTrigger>
            <Portal>
              <PopoverContent width="calc(100vw - 2rem)" maxWidth="calc(3.5in + 2rem)">
                <PopoverArrow />
                <PopoverBody
                  mt="5"
                  p="4"
                  alignItems="center"
                  justifyContent="center"
                  display="flex"
                  flexDirection="column"
                  textAlign="center"
                >
                  <>
                    <Box width="100%" display="flex" justifyContent="center">
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
          </Box>

          <Box flex={1} display="flex" justifyContent="flex-start">
            <Tooltip
              label="Send uses Cardano Koios. Switch network for ADA transfers."
              isDisabled={!isMidnightNetworkId(settings.network.id)}
              hasArrow
            >
              <Button
                w="120px"
                data-testid="wallet-send"
                onClick={() => {
                  navigate('/send');
                }}
                className={sendBtnClass}
                color={actionBtnColor}
                size="sm"
                background={sendButton}
                _hover={
                  colorMode === 'light' ? { bg: 'purple.600' } : undefined
                }
                rounded="lg"
                rightIcon={<Icon as={BsArrowUpRight} />}
                shadow="md"
                flexShrink={0}
                isDisabled={isMidnightNetworkId(settings.network.id)}
              >
                Send
              </Button>
            </Tooltip>
          </Box>
          </Flex>
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
              <AssetsViewer
                assets={
                  state.account == null
                    ? undefined
                    : (state.account.ft ?? [])
                }
              />
            </TabPanel>
            <TabPanel>
              <CollectiblesViewer
                assets={
                  state.account == null
                    ? undefined
                    : (state.account.nft ?? [])
                }
                onUpdateAvatar={() => getData({ skipUpdate: true })}
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
      </Box>
      <DeleteAccountModal
        name={state.account && state.account.name}
        ref={deletAccountRef}
      />
      <TransactionBuilder
        ref={builderRef}
        onConfirm={() => schedulePostTxRefresh()}
      />
      <About ref={aboutRef} />
    </>
  );
};

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
                try {
                  await deleteAccount();
                  const remaining = await getAccounts();
                  const firstKey = Object.keys(remaining)[0];
                  if (firstKey !== undefined) {
                    await switchAccount(isNaN(firstKey) ? firstKey : parseInt(firstKey));
                  }
                } catch (e) {
                  console.error('Delete account error:', e);
                }
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

const DelegationPopover = ({ account, delegation, label }) => {
  const settings = useStoreState((state) => state.settings.settings);
  const withdrawRef = React.useRef();
  const popoverInnerBg = useColorModeValue('gray.50', 'black');
  const popoverBorder = useColorModeValue('gray.200', 'black');
  return (
    <>
      <Popover offset={[80, 8]}>
        <PopoverTrigger>
          <Button
            {...walletFloatingActionButtonProps}
            aria-label={
              label
                ? `Open delegation details for ${label}`
                : 'Open delegation details'
            }
          >
            <Icon as={MdOutlineHowToReg} boxSize={6} />
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
            background={popoverInnerBg}
            borderWidth="1px"
            borderColor={popoverBorder}
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
              quantity={bigIntLovelace(delegation.rewards).toString()}
              decimals={6}
              symbol={settings.adaSymbol}
            />
            <Box h="4" />
            <Tooltip
              placement="top"
              isDisabled={bigIntLovelace(delegation.rewards) >= 2000000n}
              label="2 ADA minimum"
            >
              <span>
                <Button
                  onClick={() =>
                    withdrawRef.current.initWithdrawal(account, delegation)
                  }
                  isDisabled={bigIntLovelace(delegation.rewards) < 2000000n}
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
