import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Link,
  Progress,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import {
  ExternalLinkIcon,
  InfoOutlineIcon,
  SearchIcon,
} from '@chakra-ui/icons';
import {
  MdOutlineHowToReg,
  MdOutlineSavings,
  MdOutlineVerified,
  MdSwapHoriz,
  MdUndo,
} from 'react-icons/md';
import { FaRegCopy } from 'react-icons/fa';
import { HW, TAB, ERROR } from '../../../config/config';
import {
  createTab,
  getCurrentAccount,
  getDelegation,
  getPoolMetadata,
  getStakePools,
  getUtxos,
  openKeystoneSignTxTab,
  searchPools,
} from '../../../api/extension';
import {
  delegationTx,
  initTx,
  signAndSubmit,
  signAndSubmitHW,
  undelegateTx,
  withdrawalTx,
} from '../../../api/extension/wallet';
import ConfirmModal from '../components/confirmModal';
import UnitDisplay from '../components/unitDisplay';
import useSurfaceColors from '../hooks/useSurfaceColors';

const LOVELACE_PER_ADA = 1000000n;
const MIN_REWARD_WITHDRAWAL = 2000000n;

const toBigInt = (value) => {
  try {
    return BigInt(value || 0);
  } catch {
    return 0n;
  }
};

const ada = (lovelace) => {
  const value = toBigInt(lovelace);
  const whole = value / LOVELACE_PER_ADA;
  const fraction = (value % LOVELACE_PER_ADA).toString().padStart(6, '0');
  return `${whole}.${fraction.slice(0, 2)} ADA`;
};

const percent = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0%';
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
};

const poolLabel = (pool) => pool?.ticker || pool?.name || 'Unknown pool';

const poolId = (pool) => pool?.poolId || pool?.id || '';

const poolHex = (pool) => pool?.poolIdHex || pool?.hex || '';

const shortPoolId = (pool) => {
  const id = poolId(pool);
  if (!id) return 'No pool id';
  return `${id.slice(0, 12)}...${id.slice(-8)}`;
};

const actionCopy = {
  delegate: {
    title: 'Confirm Delegation',
    success: 'Delegation submitted',
    failed: 'Delegation failed',
  },
  withdraw: {
    title: 'Withdraw Rewards',
    success: 'Withdrawal submitted',
    failed: 'Withdrawal failed',
  },
  unstake: {
    title: 'Unstake',
    success: 'Unstake transaction submitted',
    failed: 'Unstake failed',
  },
};

const Metric = ({ label, value }) => {
  const { panelBorder, metricBg, mutedFg } = useSurfaceColors();
  return (
    <Box
      borderWidth="1px"
      borderColor={panelBorder}
      rounded="xl"
      bg={metricBg}
      px={3}
      py={2}
    >
      <Text fontSize="2xs" textTransform="uppercase" color={mutedFg}>
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="bold">
        {value}
      </Text>
    </Box>
  );
};

const PoolCard = ({ pool, selected, onSelect }) => {
  const {
    panelBorder,
    poolIdleBg,
    poolIdleFg,
    poolIdleHover,
    progressTrack,
  } = useSurfaceColors();
  const saturation = Math.max(0, Math.min(Number(pool.liveSaturation || 0), 1));
  return (
    <Box
      as="button"
      type="button"
      textAlign="left"
      width="full"
      onClick={() => onSelect(pool)}
      borderWidth="1px"
      borderColor={selected ? 'yellow.300' : panelBorder}
      bg={selected ? 'yellow.400' : poolIdleBg}
      color={selected ? 'gray.900' : poolIdleFg}
      rounded="2xl"
      p={4}
      transition="all 0.18s ease"
      _hover={{
        transform: 'translateY(-2px)',
        borderColor: selected ? 'yellow.300' : 'yellow.500',
        bg: selected ? 'yellow.300' : poolIdleHover,
      }}
    >
      <Flex align="start" justify="space-between" gap={3}>
        <Box minW={0}>
          <HStack spacing={2} mb={1}>
            <Badge colorScheme={selected ? 'blackAlpha' : 'yellow'}>
              {pool.ticker}
            </Badge>
            <Text fontWeight="bold" noOfLines={1}>
              {pool.name}
            </Text>
          </HStack>
          <Text fontSize="xs" opacity={0.78} noOfLines={2}>
            {pool.description || 'No metadata description published.'}
          </Text>
        </Box>
      </Flex>
      <Stack spacing={2} mt={4}>
        <Flex justify="space-between" fontSize="xs">
          <Text>Saturation</Text>
          <Text fontWeight="semibold">{percent(pool.liveSaturation)}</Text>
        </Flex>
        <Progress
          value={saturation * 100}
          size="sm"
          rounded="full"
          colorScheme={saturation > 0.9 ? 'red' : 'yellow'}
          bg={selected ? 'blackAlpha.200' : progressTrack}
        />
        <SimpleGrid columns={2} spacing={2}>
          <Metric label="Margin" value={percent(pool.margin)} />
          <Metric label="Fixed" value={ada(pool.fixedCost)} />
        </SimpleGrid>
      </Stack>
    </Box>
  );
};

const ActionCard = ({ icon, title, text, onClick, isDisabled, isLoading }) => {
  const { panelBorder, cardBg, mutedFg } = useSurfaceColors();
  return (
    <Box
      borderWidth="1px"
      borderColor={panelBorder}
      bg={cardBg}
      rounded="2xl"
      p={4}
    >
      <HStack spacing={3} align="start">
        <Flex
          rounded="xl"
          bg="yellow.400"
          color="gray.900"
          boxSize="10"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <Icon as={icon} boxSize={5} />
        </Flex>
        <Box>
          <Text fontWeight="bold">{title}</Text>
          <Text fontSize="xs" color={mutedFg} mt={1}>
            {text}
          </Text>
        </Box>
      </HStack>
      <Button
        mt={4}
        width="full"
        colorScheme="yellow"
        variant="outline"
        onClick={onClick}
        isDisabled={isDisabled}
        isLoading={isLoading}
      >
        Start
      </Button>
    </Box>
  );
};

const PreviewRow = ({ label, value, children }) => {
  const { mutedFg } = useSurfaceColors();
  return (
    <Flex justify="space-between" gap={4} fontSize="sm">
      <Text color={mutedFg}>{label}</Text>
      <Box textAlign="right" fontWeight="semibold">
        {children || value}
      </Box>
    </Flex>
  );
};

const Staking = () => {
  const toast = useToast();
  const confirmRef = React.useRef();
  const [account, setAccount] = React.useState(null);
  const [delegation, setDelegation] = React.useState(null);
  const [protocolParameters, setProtocolParameters] = React.useState(null);
  const [pools, setPools] = React.useState([]);
  const [selectedPool, setSelectedPool] = React.useState(null);
  const [query, setQuery] = React.useState('HODLR');
  const [txPreview, setTxPreview] = React.useState(null);
  const [txMode, setTxMode] = React.useState('delegate');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isPoolsLoading, setIsPoolsLoading] = React.useState(false);
  const [isBuilding, setIsBuilding] = React.useState(false);
  const [error, setError] = React.useState('');
  const [poolError, setPoolError] = React.useState('');
  const [showPoolSearch, setShowPoolSearch] = React.useState(true);
  const didAutoSelect = React.useRef(false);
  const [submittedTx, setSubmittedTx] = React.useState('');
  const {
    pageBg,
    pageFg,
    panelBg,
    panelBorder,
    panelShadow,
    cardBg,
    insetBg,
    mutedFg,
    softFg,
    inputBg,
    inputBorder,
    subtleFg,
    yellowLink,
  } = useSurfaceColors();

  const loadStakeState = React.useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [nextAccount, nextDelegation, nextProtocolParameters] =
        await Promise.all([getCurrentAccount(), getDelegation(), initTx()]);
      setAccount(nextAccount);
      setDelegation(nextDelegation);
      setProtocolParameters(nextProtocolParameters);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Unable to load staking state.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStakeState();
  }, [loadStakeState]);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsPoolsLoading(true);
      setPoolError('');
      try {
        const trimmed = query.trim();
        const nextPools = trimmed.length >= 2
          ? await searchPools(trimmed)
          : await getStakePools(18);
        if (!cancelled) {
          setPools(nextPools);
          if (!didAutoSelect.current && nextPools.length > 0) {
            const hodlr = nextPools.find(
              (p) => (p.ticker || '').toUpperCase() === 'HODLR'
            );
            if (hodlr) {
              didAutoSelect.current = true;
              setSelectedPool(hodlr);
              setShowPoolSearch(false);
            }
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setPoolError(e?.message || 'Unable to load stake pools.');
          setPools([]);
        }
      } finally {
        if (!cancelled) setIsPoolsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const buildDelegatePreview = async (pool) => {
    setIsBuilding(true);
    setError('');
    setSubmittedTx('');
    setTxPreview(null);
    setTxMode('delegate');
    setSelectedPool(pool);
    setShowPoolSearch(false);
    try {
      if (!account || !delegation || !protocolParameters) {
        throw new Error('Staking data is still loading. Try again in a moment.');
      }

      const detailedPool = poolHex(pool) ? pool : await getPoolMetadata(poolId(pool));
      setSelectedPool(detailedPool);
      const tx = await delegationTx(
        account,
        delegation,
        protocolParameters,
        poolHex(detailedPool)
      );
      setTxPreview({
        mode: 'delegate',
        tx,
        pool: detailedPool,
        fee: tx.body().fee().toString(),
        stakeRegistration: delegation.registered ? '0' : protocolParameters.keyDeposit,
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Unable to prepare delegation transaction.');
    } finally {
      setIsBuilding(false);
    }
  };

  const buildWithdrawalPreview = async () => {
    setIsBuilding(true);
    setError('');
    setSubmittedTx('');
    setTxMode('withdraw');
    try {
      const protocol = protocolParameters || await initTx();
      const utxos = await getUtxos();
      const tx = await withdrawalTx(account, delegation, protocol, utxos);
      setTxPreview({
        mode: 'withdraw',
        tx,
        fee: tx.body().fee().toString(),
        rewards: delegation.rewards,
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Unable to prepare reward withdrawal.');
    } finally {
      setIsBuilding(false);
    }
  };

  const buildUnstakePreview = async () => {
    setIsBuilding(true);
    setError('');
    setSubmittedTx('');
    setTxMode('unstake');
    try {
      const protocol = protocolParameters || await initTx();
      const tx = await undelegateTx(account, delegation, protocol);
      setTxPreview({
        mode: 'unstake',
        tx,
        fee: tx.body().fee().toString(),
        returnedDeposit: protocol.keyDeposit,
      });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Unable to prepare unstake transaction.');
    } finally {
      setIsBuilding(false);
    }
  };

  const openConfirm = () => {
    if (!txPreview || !account) return;
    confirmRef.current.openModal(account.index);
  };

  const copyPoolId = async () => {
    const pool = selectedPool || activePool;
    if (!pool) return;
    try {
      await navigator.clipboard.writeText(poolId(pool));
      toast({ title: 'Pool id copied', status: 'success', duration: 1800 });
    } catch {
      toast({ title: 'Unable to copy pool id', status: 'warning', duration: 1800 });
    }
  };

  if (isLoading) {
    return (
      <Flex minH="100vh" align="center" justify="center">
        <Spinner color="yellow.400" speed="0.65s" />
      </Flex>
    );
  }

  const activePool = delegation?.active
    ? {
      ticker: delegation.ticker,
      name: delegation.name,
      description: delegation.description,
      homepage: delegation.homepage,
      poolId: delegation.poolId,
      poolIdHex: delegation.poolIdHex,
      margin: delegation.margin,
      fixedCost: delegation.fixedCost,
      pledge: delegation.pledge,
      activeStake: delegation.activeStake,
      liveSaturation: delegation.liveSaturation,
    }
    : null;
  const rewards = toBigInt(delegation?.rewards);
  const activeLabel =
    activePool?.ticker ||
    activePool?.name ||
    (activePool ? shortPoolId(activePool) : 'your pool');

  return (
    <Box
      data-testid="stake-center-page"
      minH="100vh"
      bg={pageBg}
      color={pageFg}
      px={{ base: 4, md: 6 }}
      py={5}
      pb="calc(6.5rem + env(safe-area-inset-bottom, 0px))"
    >
      <Stack spacing={5} maxW="1100px" mx="auto">
        <Box
          rounded="3xl"
          p={{ base: 5, md: 7 }}
          bg={panelBg}
          boxShadow={panelShadow}
        >
          <Flex direction={{ base: 'column', md: 'row' }} gap={5} justify="space-between">
            <Box maxW="650px">
              <Badge colorScheme="yellow" mb={2}>
                Stake Center
              </Badge>
              <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="black" lineHeight="1.05">
                Make your ADA work while you keep custody.
              </Text>
              <Text color={softFg} mt={2} fontSize="xs" noOfLines={2}>
                Choose a pool, preview the deposit and fee, then sign with the same secure
                password or hardware wallet flow used everywhere else in Lucem.
              </Text>
            </Box>
            <Box
              minW={{ base: 'full', md: '270px' }}
              rounded="2xl"
              bg={insetBg}
              borderWidth="1px"
              borderColor={panelBorder}
              p={4}
            >
              <HStack spacing={3}>
                <Flex rounded="2xl" bg="yellow.400" color="gray.900" boxSize="12" align="center" justify="center">
                  <Icon as={delegation?.active ? MdOutlineVerified : MdOutlineHowToReg} boxSize={7} />
                </Flex>
                <Box>
                  <Text fontSize="xs" color={mutedFg}>
                    Current status
                  </Text>
                  <Text fontWeight="bold">
                    {delegation?.active ? `Delegated to ${activeLabel}` : 'Ready to delegate'}
                  </Text>
                </Box>
              </HStack>
              <Stack spacing={3} mt={5}>
                <PreviewRow label="Rewards">
                  <UnitDisplay
                    hide
                    quantity={String(rewards)}
                    decimals={6}
                    symbol="ADA"
                    fontSize="sm"
                  />
                </PreviewRow>
                <PreviewRow label="Stake deposit" value={delegation?.active ? 'Registered' : '2 ADA when registering'} />
                <PreviewRow label="Reward withdrawal" value="2 ADA minimum" />
              </Stack>
            </Box>
          </Flex>
        </Box>

        {error && (
          <Alert
            status="error"
            rounded="2xl"
            bg="red.900"
            color="white"
            cursor="pointer"
            _hover={{ opacity: 0.85 }}
            onClick={() => {
              navigator.clipboard.writeText(error).then(() =>
                toast({ title: 'Error copied', status: 'info', duration: 1500 })
              );
            }}
            title="Click to copy"
          >
            <AlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {submittedTx && (
          <Alert status="success" rounded="2xl" bg="green.900" color="white">
            <AlertIcon />
            <AlertDescription>Submitted transaction: {submittedTx}</AlertDescription>
          </Alert>
        )}

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <Box
            borderWidth="1px"
            borderColor={panelBorder}
            bg={cardBg}
            rounded="2xl"
            p={4}
          >
            <HStack spacing={3} align="start">
              <Flex
                rounded="xl"
                bg="yellow.400"
                color="gray.900"
                boxSize="10"
                align="center"
                justify="center"
                flexShrink={0}
              >
                <Icon as={delegation?.active ? MdSwapHoriz : MdOutlineHowToReg} boxSize={5} />
              </Flex>
              <Box flex={1}>
                <Text fontWeight="bold">{delegation?.active ? 'Change Pool' : 'Delegate'}</Text>
                <Text fontSize="xs" color={mutedFg} mt={1}>
                  Search by ticker or pool id.
                </Text>
              </Box>
              {isPoolsLoading && <Spinner color="yellow.400" size="sm" />}
            </HStack>

            {selectedPool && !showPoolSearch && (
              <Box mt={3}>
                <PoolCard
                  pool={selectedPool}
                  selected
                  onSelect={() => {}}
                />
                <Button
                  mt={2}
                  size="sm"
                  width="full"
                  variant="outline"
                  colorScheme="yellow"
                  onClick={() => setShowPoolSearch(true)}
                >
                  Change Pool
                </Button>
              </Box>
            )}

            {showPoolSearch && (
              <Box mt={3}>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <SearchIcon color={subtleFg} />
                  </InputLeftElement>
                  <Input
                    id="stake-pool-search"
                    data-testid="stake-pool-search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); didAutoSelect.current = true; }}
                    placeholder="Search ticker or pool id"
                    bg={inputBg}
                    borderColor={inputBorder}
                    focusBorderColor="yellow.400"
                  />
                </InputGroup>
                {poolError && (
                  <Alert
                    status="warning"
                    rounded="xl"
                    mt={3}
                    bg="orange.900"
                    color="white"
                    cursor="pointer"
                    _hover={{ opacity: 0.85 }}
                    onClick={() => {
                      navigator.clipboard.writeText(poolError).then(() =>
                        toast({ title: 'Error copied', status: 'info', duration: 1500 })
                      );
                    }}
                    title="Click to copy"
                  >
                    <AlertIcon />
                    <AlertDescription>{poolError}</AlertDescription>
                  </Alert>
                )}
                <Stack spacing={3} mt={3} maxH="400px" overflowY="auto" pr={1}>
                  {pools.map((pool) => (
                    <PoolCard
                      key={poolId(pool)}
                      pool={pool}
                      selected={poolId(pool) === poolId(selectedPool)}
                      onSelect={buildDelegatePreview}
                    />
                  ))}
                  {!isPoolsLoading && pools.length === 0 && (
                    <Box textAlign="center" color={mutedFg} py={4}>
                      No stake pools found.
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
          </Box>

          <ActionCard
            icon={MdOutlineSavings}
            title="Withdraw Rewards"
            text="Collect available staking rewards back into your wallet balance."
            onClick={buildWithdrawalPreview}
            isDisabled={rewards < MIN_REWARD_WITHDRAWAL}
            isLoading={isBuilding && txMode === 'withdraw'}
          />
          <ActionCard
            icon={MdUndo}
            title="Unstake"
            text="Deregister the stake key and reclaim the stake deposit after rewards are handled."
            onClick={buildUnstakePreview}
            isDisabled={!delegation?.active}
            isLoading={isBuilding && txMode === 'unstake'}
          />
        </SimpleGrid>

        <Stack spacing={5}>
            <Box
              data-testid="stake-pool-details"
              rounded="3xl"
              bg={panelBg}
              borderWidth="1px"
              borderColor={panelBorder}
              p={5}
            >
              <Text fontSize="xl" fontWeight="black">
                Pool Details
              </Text>
              {selectedPool || activePool ? (
                <Stack spacing={4} mt={4}>
                  <HStack spacing={3}>
                    <Badge colorScheme="yellow" fontSize="sm">
                      {poolLabel(selectedPool || activePool)}
                    </Badge>
                    {(selectedPool || activePool)?.homepage && (
                      <Link
                        href={(selectedPool || activePool).homepage}
                        isExternal
                        color={yellowLink}
                        fontSize="xs"
                      >
                        Website <ExternalLinkIcon mx="2px" />
                      </Link>
                    )}
                  </HStack>
                  <Text fontSize="sm" color={softFg}>
                    {(selectedPool || activePool)?.description || 'No description published.'}
                  </Text>
                  <HStack spacing={2}>
                    <Text fontSize="xs" color={mutedFg} noOfLines={1}>
                      {shortPoolId(selectedPool || activePool)}
                    </Text>
                    <Button
                      size="xs"
                      leftIcon={<FaRegCopy />}
                      onClick={copyPoolId}
                      variant="outline"
                      colorScheme="yellow"
                    >
                      Copy
                    </Button>
                  </HStack>
                  <SimpleGrid columns={2} spacing={3}>
                    <Metric label="Saturation" value={percent((selectedPool || activePool).liveSaturation)} />
                    <Metric label="Margin" value={percent((selectedPool || activePool).margin)} />
                    <Metric label="Pledge" value={ada((selectedPool || activePool).pledge)} />
                    <Metric label="Active stake" value={ada((selectedPool || activePool).activeStake)} />
                  </SimpleGrid>
                </Stack>
              ) : (
                <Box mt={4} color={mutedFg} fontSize="sm">
                  Select a pool to see metadata, fees, saturation, pledge, and the transaction preview.
                </Box>
              )}
            </Box>

            <Box rounded="3xl" bg={panelBg} boxShadow={panelShadow} p={5}>
              <HStack spacing={2} mb={4}>
                <InfoOutlineIcon color="yellow.300" />
                <Text fontSize="xl" fontWeight="black">
                  Transaction Preview
                </Text>
              </HStack>
              {isBuilding && (
                <Flex align="center" gap={3} color={softFg}>
                  <Spinner size="sm" color="yellow.400" />
                  <Text fontSize="sm">Preparing transaction...</Text>
                </Flex>
              )}
              {!isBuilding && txPreview ? (
                <Stack spacing={3}>
                  {txPreview.pool && (
                    <PreviewRow label="Selected pool" value={poolLabel(txPreview.pool)} />
                  )}
                  {txPreview.rewards && (
                    <PreviewRow label="Rewards" value={ada(txPreview.rewards)} />
                  )}
                  {txPreview.stakeRegistration && txPreview.stakeRegistration !== '0' && (
                    <PreviewRow label="Stake registration" value={ada(txPreview.stakeRegistration)} />
                  )}
                  {txPreview.returnedDeposit && (
                    <PreviewRow label="Returned deposit" value={ada(txPreview.returnedDeposit)} />
                  )}
                  <PreviewRow label="Network fee" value={ada(txPreview.fee)} />
                  <Alert status="info" rounded="xl" bg={cardBg} color={pageFg}>
                    <AlertIcon />
                    <AlertDescription fontSize="xs">
                      Delegation becomes active after upcoming epoch boundaries. Rewards are never locked,
                      and your ADA stays in your wallet.
                    </AlertDescription>
                  </Alert>
                  <Button
                    data-testid="stake-confirm-transaction"
                    colorScheme="yellow"
                    onClick={openConfirm}
                  >
                    Confirm and Sign
                  </Button>
                </Stack>
              ) : !isBuilding && (
                <Text fontSize="sm" color={mutedFg}>
                  Select a pool or choose a rewards action to preview costs before signing.
                </Text>
              )}
            </Box>
        </Stack>
      </Stack>
      <ConfirmModal
        ref={confirmRef}
        ready={Boolean(txPreview?.tx)}
        title={actionCopy[txMode].title}
        sign={async (password, hw) => {
          if (hw) {
            if (hw.device === HW.trezor) {
              return createTab(
                TAB.trezorTx,
                `?tx=${Buffer.from(txPreview.tx.to_bytes()).toString('hex')}`
              );
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex: Buffer.from(txPreview.tx.to_bytes()).toString('hex'),
                keyHashes: [account.paymentKeyHash, account.stakeKeyHash],
                partialSign: false,
              });
            }
            return signAndSubmitHW(txPreview.tx, {
              keyHashes: [account.paymentKeyHash, account.stakeKeyHash],
              account,
              hw,
            });
          }
          return signAndSubmit(
            txPreview.tx,
            {
              keyHashes: [account.paymentKeyHash, account.stakeKeyHash],
              accountIndex: account.index,
            },
            password
          );
        }}
        onHwKeystone={() =>
          openKeystoneSignTxTab({
            txHex: Buffer.from(txPreview.tx.to_bytes()).toString('hex'),
            keyHashes: [account.paymentKeyHash, account.stakeKeyHash],
            partialSign: false,
          })
        }
        onConfirm={async (status, signedTx) => {
          if (status === true) {
            const txHash = typeof signedTx === 'string' ? signedTx : '';
            setSubmittedTx(txHash);
            setTxPreview(null);
            confirmRef.current.closeModal();
            toast({
              title: actionCopy[txMode].success,
              status: 'success',
              duration: 4000,
            });
            await loadStakeState();
            setTimeout(() => loadStakeState(), 15000);
            return;
          }

          const description = signedTx === ERROR.fullMempool
            ? 'Mempool full. Try again.'
            : String(signedTx?.message || signedTx || 'Transaction could not be submitted.');
          toast({
            title: actionCopy[txMode].failed,
            description: description.slice(0, 180),
            status: 'error',
            duration: 6000,
            render: ({ onClose }) => (
              <Alert
                status="error"
                rounded="xl"
                bg="red.900"
                color="white"
                cursor="pointer"
                _hover={{ opacity: 0.85 }}
                onClick={() => {
                  navigator.clipboard.writeText(description);
                  toast({ title: 'Copied', status: 'info', duration: 1200 });
                  onClose();
                }}
                title="Tap to copy"
                p={4}
              >
                <AlertIcon />
                <Box>
                  <Text fontWeight="bold" fontSize="sm">{actionCopy[txMode].failed}</Text>
                  <Text fontSize="xs">{description.slice(0, 180)}</Text>
                </Box>
              </Alert>
            ),
          });
          confirmRef.current.closeModal();
        }}
      />
    </Box>
  );
};

export default Staking;
