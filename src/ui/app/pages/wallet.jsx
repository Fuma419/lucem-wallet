import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  displayUnit,
  getAccounts,
  getCurrentAccountIndex,
  getDelegation,
  getFiatPrice,
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import {
  InfoOutlineIcon,
} from '@chakra-ui/icons';
import ReceivePanel from '../components/receivePanel';
import UnitDisplay from '../components/unitDisplay';
import PullToRefresh from '../components/pullToRefresh';
import { onAccountChange } from '../../../api/extension';
import HistoryViewer from '../components/historyViewer';
import { useStoreState } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { currencyToSymbol, fromAssetUnit } from '../../../api/util';
import { NETWORK_ID } from '../../../config/config';
import { RxTokens } from "react-icons/rx";
import { GoHistory } from "react-icons/go";
import { MdRefresh } from 'react-icons/md';
import CollectiblesViewer from '../components/collectiblesViewer';
import AssetFingerprint from '@emurgo/cip14-js';
import { useColorModeValue } from '@chakra-ui/react';
import { LUCEM_LAYOUT } from '../../layout/surface';
import { useLayoutSurface } from '../../layout/LayoutSurfaceProvider';

// Assets
import Logo from '../../../assets/img/logo.png';

/**
 * `logo.png` packs most of its box in soft glow; the disc is smaller than the
 * file edges. Avatars fill the clip. Matching only `boxSize` leaves the Lucem
 * orb looking smaller — overscan so the disc matches the account chip.
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

/** Soft ceiling so a hung Koios/Blockfrost call cannot leave the refresh spinner on forever. */
const REFRESH_TIMEOUT_MS = 45_000;

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const Wallet = () => {
  const isMounted = useIsMounted();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useStoreState((state) => state.settings.settings);
  const isDesktop = useLayoutSurface() === LUCEM_LAYOUT.desktop;
  const avatarBg = useColorModeValue('gray.100', 'gray.900');
  const panelBg = useColorModeValue('#f4f6fb', '#080808');
  // Always use neon button classes (same as tray FABs). Glow on/off is owned by
  // `html[data-glow]` + CSS — do not swap to solid Chakra fills when glow is
  // off, or dark mode falls back to light-looking brand colors.
  const receiveBtnClass = 'button import-wallet';
  const sendBtnClass = 'button new-wallet';
  const {
    isOpen: isReceiveOpen,
    onOpen: onReceiveOpen,
    onClose: onReceiveClose,
  } = useDisclosure();

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
    try {
      const currentIndex = await getCurrentAccountIndex();
      const accounts = await getAccounts();
      const { avatar, name, index, paymentAddr } = accounts[currentIndex];
      if (!isMounted.current) return;
      setInfo({ avatar, name, currentIndex: index, paymentAddr, accounts });
      if (!skipUpdate) {
        await withTimeout(
          updateAccount(forceUpdate),
          REFRESH_TIMEOUT_MS,
          'updateAccount'
        );
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
      (currentAccount.assets ?? []).forEach((asset) => {
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
        // Cached per-currency (90s TTL); `forceUpdate` bypasses on pull/refresh.
        price = await getFiatPrice(settings.currency, { force: forceUpdate });
        fiatPrice.current = price;
      } catch (e) {}
      const network = await getNetwork();
      try {
        const delegation = await withTimeout(
          getDelegation({ force: forceUpdate }),
          REFRESH_TIMEOUT_MS,
          'getDelegation'
        );
        if (!isMounted.current) return;
        setState((s) => ({
          ...s,
          account: currentAccount,
          accounts: allAccounts,
          fiatPrice: price,
          network,
          delegation,
        }));
      } catch (delegationError) {
        console.warn(
          'Delegation refresh failed:',
          delegationError.message || delegationError
        );
        if (!isMounted.current) return;
        setState((s) => ({
          ...s,
          account: currentAccount,
          accounts: allAccounts,
          fiatPrice: price,
          network,
        }));
      }
      lastRefreshRef.current = Date.now();
    } catch (e) {
      console.error('Failed to load account data:', e);
    } finally {
      // Pull-to-refresh awaits getData; if we leave isFetching true the
      // balance spinner never stops (even when PullToRefresh clears its own busy).
      setIsFetching(false);
    }
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

  const accountAdaLovelace = React.useMemo(() => {
    if (
      !state.account ||
      state.account.lovelace === null ||
      state.account.lovelace === undefined
    ) {
      return null;
    }
    return (
      bigIntLovelace(state.account.lovelace) -
      bigIntLovelace(state.account.minAda) -
      bigIntLovelace(state.account.collateral?.lovelace)
    );
  }, [state.account]);

  const rewardsAdaLovelace = React.useMemo(
    () =>
      state.delegation
        ? bigIntLovelace(state.delegation.rewards)
        : 0n,
    [state.delegation]
  );

  const displayTotalAda =
    accountAdaLovelace !== null
      ? (accountAdaLovelace + rewardsAdaLovelace).toString()
      : undefined;

  const fiatTotalCents =
    accountAdaLovelace !== null
      ? parseInt(
          displayUnit(displayTotalAda) * state.fiatPrice * 10 ** 2
        )
      : undefined;

  const assetsViewer = (
    <CollectiblesViewer
      assets={collectibleAssets}
      onUpdateAvatar={() => getData({ skipUpdate: true })}
    />
  );
  const historyViewer = (
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
  );

  return (
    <PullToRefresh onRefresh={() => getData({ forceUpdate: true })}>
      <Box
        minH="100vh"
        sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
        display="flex"
        alignItems="stretch"
        flexDirection="column"
        w="full"
        maxW="100%"
      >
        <Box className="lucem-wallet-main-column lucem-wallet-home" flex="1" display="flex" flexDirection="column">
        <Box
          background={panelBg}
          shadow="md"
          width="full"
          maxWidth="100%"
          position="relative"
          overflow="visible"
          pb={{ base: 4, md: 6 }}
        >
          {/* Icon row — orbs only. The testnet badge sits below so a centered
              punch-hole camera cannot sit in the middle of the banner. */}
          <Flex
            className="lucem-wallet-header"
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
            <Box flex="1" display="flex" justifyContent="flex-start" minW={0}>
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
            </Box>
            <Box flex="1" display="flex" justifyContent="flex-end" minW={0}>
              <Box {...walletHeaderOrbShellProps} bg={avatarBg} position="relative">
                <Box position="absolute" inset={0}>
                  <AvatarLoader avatar={info.avatar} width="100%" />
                </Box>
              </Box>
            </Box>
          </Flex>
          {testnetBanner ? (
            <Flex
              className="lucem-wallet-network-row"
              justify="center"
              align="center"
              w="full"
              px={{ base: 4, md: 5 }}
              pb={1}
              flexShrink={0}
            >
              <Box
                className={`network-banner network-banner-${testnetBanner.id}`}
                role="status"
                aria-label={`Connected to ${testnetBanner.label}`}
                data-testid="wallet-network-banner"
              >
                {testnetBanner.label}
              </Box>
            </Flex>
          ) : null}

          <Box
            className="lucem-wallet-name"
            px={{ base: 3, md: 4 }}
            pb={1}
            flexShrink={0}
            textAlign="center"
          >
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
            className="lucem-wallet-balance"
            direction="column"
            align="center"
            justify="center"
            py={{ base: 2, md: 4 }}
            px={2}
            flexShrink={0}
            gap={1}
          >
            <Flex align="center" justify="center" flexWrap="wrap" gap={1}>
              <Popover isLazy placement="bottom" trigger="click">
                <PopoverTrigger>
                  <Box
                    as="button"
                    type="button"
                    cursor="pointer"
                    borderRadius="md"
                    aria-label="Show ADA balance breakdown"
                    data-testid="wallet-total-ada"
                    _hover={{ bg: 'whiteAlpha.100' }}
                    _focusVisible={{
                      outline: '2px solid',
                      outlineColor: 'whiteAlpha.700',
                      outlineOffset: '2px',
                    }}
                    px={1}
                  >
                    {/* Loading is only the refresh control beside the balance —
                        keep the ADA figure visible (or blank) without a Skeleton. */}
                    <UnitDisplay
                      className="lineClamp"
                      fontSize={isDesktop ? '4xl' : { base: 'xl', md: '2xl' }}
                      fontWeight="bold"
                      quantity={displayTotalAda}
                      decimals={6}
                      symbol={settings.adaSymbol}
                      minW={
                        accountAdaLovelace != null ? undefined : '7rem'
                      }
                      minH={
                        accountAdaLovelace != null ? undefined : '1.75rem'
                      }
                    />
                  </Box>
                </PopoverTrigger>
                <Portal>
                  <PopoverContent
                    width="auto"
                    maxW="calc(100vw - 2rem)"
                    data-testid="wallet-ada-breakdown"
                  >
                    <PopoverArrow />
                    <PopoverBody p={3}>
                      <Flex direction="column" gap={2} minW="12rem">
                        <Flex
                          align="center"
                          justify="space-between"
                          gap={4}
                          data-testid="wallet-account-ada"
                        >
                          <Text fontSize="sm" opacity={0.85}>
                            Account
                          </Text>
                          <UnitDisplay
                            hide
                            fontSize="sm"
                            fontWeight="semibold"
                            quantity={
                              accountAdaLovelace !== null
                                ? accountAdaLovelace.toString()
                                : undefined
                            }
                            decimals={6}
                            symbol={settings.adaSymbol}
                          />
                        </Flex>
                        <Flex
                          align="center"
                          justify="space-between"
                          gap={4}
                          data-testid="wallet-rewards-balance"
                        >
                          <Text fontSize="sm" opacity={0.85}>
                            Rewards
                          </Text>
                          <UnitDisplay
                            hide
                            fontSize="sm"
                            fontWeight="semibold"
                            quantity={rewardsAdaLovelace.toString()}
                            decimals={6}
                            symbol={settings.adaSymbol}
                          />
                        </Flex>
                      </Flex>
                    </PopoverBody>
                  </PopoverContent>
                </Portal>
              </Popover>
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
              quantity={fiatTotalCents}
              symbol={currencyToSymbol(settings.currency)}
              decimals={2}
            />
          </Flex>

          {/* Receive, delegation, Send — flows under balance (no overlap). */}
          <Flex
            className="lucem-wallet-actions"
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
            <Button
              w="120px"
              h="2.6rem"
              data-testid="wallet-receive"
              className={receiveBtnClass}
              color="white"
              rightIcon={<Icon as={BsArrowDownRight} />}
              size="sm"
              rounded="2xl"
              flexShrink={0}
              onClick={onReceiveOpen}
            >
              Receive
            </Button>
            <Modal
              isOpen={isReceiveOpen}
              onClose={onReceiveClose}
              isCentered
              size="sm"
            >
              <ModalOverlay />
              <ModalContent
                className="lucem-inset-surface"
                mx={4}
                my="auto"
                w="calc(100vw - 2rem)"
                maxW="22rem"
                maxH="calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
                overflowY="auto"
                rounded="3xl"
                border="none"
                data-testid="receive-popover"
              >
                <ModalCloseButton />
                <ModalBody p={5}>
                  <ReceivePanel
                    address={info.paymentAddr}
                    accountName={info.name}
                  />
                </ModalBody>
              </ModalContent>
            </Modal>
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
                color="white"
                size="sm"
                rounded="2xl"
                rightIcon={<Icon as={BsArrowUpRight} />}
                flexShrink={0}
              >
                Send
              </Button>
            </Tooltip>
          </Box>
          </Flex>
        </Box>
        <Box height="8" />
        {isDesktop ? (
          <Flex
            className="lucem-wallet-desktop-panels"
            data-testid="wallet-desktop-panels"
            align="flex-start"
            gap={8}
            w="full"
            px={{ base: 2, md: 4 }}
          >
            <Box flex="1" minW={0} data-testid="wallet-desktop-assets">
              <Flex align="center" gap={2} mb={3}>
                <Icon as={RxTokens} boxSize={5} />
                <Text fontWeight="semibold">Assets</Text>
              </Flex>
              {assetsViewer}
            </Box>
            <Box flex="1" minW={0} data-testid="wallet-desktop-history">
              <Flex align="center" gap={2} mb={3}>
                <Icon as={GoHistory} boxSize={5} />
                <Text fontWeight="semibold">History</Text>
              </Flex>
              {historyViewer}
            </Box>
          </Flex>
        ) : (
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
              {assetsViewer}
            </TabPanel>
            <TabPanel>
              {historyViewer}
            </TabPanel>
          </TabPanels>
        </Tabs>
        )}
        </Box>
        {/* Clearance for fixed lower trays from WalletShell (hidden on desktop). */}
        <Box
          className="lucem-tray-clearance"
          pb="calc(5.5rem + env(safe-area-inset-bottom, 0px))"
          flexShrink={0}
        />
      </Box>
    </PullToRefresh>
  );
};

export default Wallet;
