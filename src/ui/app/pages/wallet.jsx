import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  displayUnit,
  getAccounts,
  getCurrentAccountIndex,
  getDelegation,
  getNetwork,
  updateAccount,
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
  Text,
  Icon,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Portal,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tooltip,
  IconButton,
  Skeleton,
} from '@chakra-ui/react';
import {
  CopyIcon,
  InfoOutlineIcon,
} from '@chakra-ui/icons';
import QrCode from '../components/qrCode';
import provider from '../../../config/provider';
import UnitDisplay from '../components/unitDisplay';
import { onAccountChange } from '../../../api/extension';
import HistoryViewer from '../components/historyViewer';
import Copy from '../components/copy';
import { useStoreState } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { currencyToSymbol, fromAssetUnit } from '../../../api/util';
import { NETWORK_ID } from '../../../config/config';
import { RxTokens } from "react-icons/rx";
import { GoHistory } from "react-icons/go";
import { MdRefresh } from 'react-icons/md';
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
  const location = useLocation();
  const settings = useStoreState((state) => state.settings.settings);
  const { colorMode } = useColorMode();
  const avatarBg = useColorModeValue('gray.100', 'gray.900');
  const panelBg = useColorModeValue('#f4f6fb', '#080808');
  /** Light: solid brand tints; dark: filled cyan / gradient class handles Send. */
  const receiveButton = useColorModeValue('cyan.500', 'cyan.700');
  const sendButton = useColorModeValue('purple.500', 'yellow.600');
  const receiveBtnClass =
    colorMode === 'dark' ? 'button import-wallet' : undefined;
  const sendBtnClass = colorMode === 'dark' ? 'button new-wallet' : undefined;
  const actionBtnColor = colorMode === 'dark' ? 'white' : 'black';

  const networkOptions = [
    { id: NETWORK_ID.mainnet, label: 'Mainnet' },
    { id: NETWORK_ID.preprod, label: 'Preprod' },
    { id: NETWORK_ID.preview, label: 'Preview' },
  ];

  const activeNetworkId = settings.network?.id;
  const testnetBanner =
    activeNetworkId && activeNetworkId !== NETWORK_ID.mainnet
      ? networkOptions.find((option) => option.id === activeNetworkId) || {
          id: activeNetworkId,
          label:
            activeNetworkId === NETWORK_ID.testnet
              ? 'Testnet'
              : String(activeNetworkId),
        }
      : null;

  const [isFetching, setIsFetching] = React.useState(false);
  const [state, setState] = React.useState({
    account: null,
    accounts: null,
    fiatPrice: 0,
    delegation: null,
    network: { id: '', node: '' },
  });

  // Stable identity so re-renders don't remount/refetch the assets grid.
  const collectibleAssets = React.useMemo(() => {
    if (state.account == null) return undefined;
    return [
      ...(state.account.ft ?? []).filter((asset) => asset.unit !== 'lovelace'),
      ...(state.account.nft ?? []),
    ];
  }, [state.account]);
  const refreshTimeoutRef = React.useRef(null);
  const lastRefreshRef = React.useRef(Date.now());
  const [info, setInfo] = React.useState({
    avatar: '',
    name: '',
    paymentAddr: '',
    accounts: {},
  }); // for quicker displaying
  const fiatPrice = React.useRef(0);

  const getData = async ({ forceUpdate = false, skipUpdate = false } = {}) => {
    setIsFetching(true);
    const currentIndex = await getCurrentAccountIndex();
    const accounts = await getAccounts();
    const { avatar, name, index, paymentAddr } = accounts[currentIndex];
    if (!isMounted.current) return;
    setInfo({ avatar, name, currentIndex: index, paymentAddr, accounts });
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
    lastRefreshRef.current = Date.now();
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
      if (location.state?.postTx) {
        schedulePostTxRefresh(15000);
      }
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
    const REFRESH_DEBOUNCE_MS = 15000;
    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        isMounted.current &&
        Date.now() - lastRefreshRef.current > REFRESH_DEBOUNCE_MS
      ) {
        getData({ forceUpdate: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
          {testnetBanner ? (
            <Box
              className={`network-banner network-banner-${testnetBanner.id}`}
              role="status"
              aria-label={`Connected to ${testnetBanner.label}`}
              data-testid="wallet-network-banner"
            >
              {testnetBanner.label}
            </Box>
          ) : null}

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
              <Skeleton
                isLoaded={
                  Boolean(state.account) &&
                  state.account.lovelace !== null &&
                  state.account.lovelace !== undefined
                }
                borderRadius="md"
                startColor="whiteAlpha.200"
                endColor="whiteAlpha.400"
                minW={
                  state.account && state.account.lovelace != null ? undefined : '7rem'
                }
                minH={
                  state.account && state.account.lovelace != null ? undefined : '1.75rem'
                }
              >
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
              </Skeleton>
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
              <IconButton
                icon={<Icon as={MdRefresh} />}
                aria-label="Refresh wallet"
                variant="ghost"
                size="xs"
                ml={1}
                isLoading={isFetching}
                onClick={() => getData({ forceUpdate: true })}
                _hover={{ bg: 'whiteAlpha.200' }}
              />
            </Flex>
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
            {state.delegation && (
              <Flex
                data-testid="wallet-rewards-balance"
                align="center"
                justify="center"
                gap={1}
                mt={1}
              >
                <Text fontSize="xs" opacity={0.8}>
                  Rewards:
                </Text>
                <UnitDisplay
                  hide
                  fontSize="sm"
                  fontWeight="semibold"
                  quantity={bigIntLovelace(state.delegation.rewards).toString()}
                  decimals={6}
                  symbol={settings.adaSymbol}
                />
              </Flex>
            )}
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
                  h="2.6rem"
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
              isDisabled={true}
              hasArrow
            >
              <Button
                w="120px"
                h="2.6rem"
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
              <CollectiblesViewer
                assets={collectibleAssets}
                onUpdateAvatar={() => getData({ skipUpdate: true })}
              />
            </TabPanel>
            <TabPanel>
              <HistoryViewer
                key={`${settings.network.id}:${
                  (state.account && state.account.paymentAddr) || ''
                }`}
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
        {/* Clearance for fixed lower trays from WalletShell */}
        <Box pb="calc(5.5rem + env(safe-area-inset-bottom, 0px))" flexShrink={0} />
      </Box>
    </>
  );
};

export default Wallet;
