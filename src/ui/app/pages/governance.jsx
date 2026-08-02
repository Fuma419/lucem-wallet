import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Input,
  Link,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import {
  ArrowBackIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  RepeatIcon,
} from '@chakra-ui/icons';
import {
  MdHowToVote,
  MdOutlineGavel,
  MdBlock,
  MdOutlineVerified,
  MdHistory,
} from 'react-icons/md';
import { useStoreState } from 'easy-peasy';

import ConfirmModal from '../components/confirmModal';
import UnitDisplay from '../components/unitDisplay';
import {
  createTab,
  getAccountDRepId,
  getCurrentAccount,
  getDelegation,
  isHW,
  openKeystoneSignTxTab,
} from '../../../api/extension';
import {
  initTx,
  signAndSubmit,
  signAndSubmitHW,
  voteDelegationTx,
  voteTx,
} from '../../../api/extension/wallet';
import {
  fetchDRepRegistration,
  fetchDRepVotes,
  fetchGovernanceOverview,
  normalizeDrepKeyHash,
} from '../../../api/governance';
import { ERROR, HW, TAB } from '../../../config/config';
import useSurfaceColors from '../hooks/useSurfaceColors';

const sourceBadgeColor = (source) =>
  source === 'blockfrost' ? 'green' : 'orange';

const truncateMiddle = (value, head = 12, tail = 8) => {
  if (!value || typeof value !== 'string') return '';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const voteLabel = (type) => {
  if (type === 'always_abstain') return 'Always Abstain';
  if (type === 'always_no_confidence') return 'Always No Confidence';
  return 'DRep Key Hash';
};

const voteKindLabel = (kind) => {
  if (kind === 'yes') return 'Vote Yes';
  if (kind === 'no') return 'Vote No';
  return 'Abstain';
};

const voteResultLabel = (kind) => {
  if (kind === 'yes') return 'Yes';
  if (kind === 'no') return 'No';
  if (kind === 'abstain') return 'Abstain';
  return 'Unknown';
};

const voteResultColor = (kind) => {
  if (kind === 'yes') return 'green';
  if (kind === 'no') return 'red';
  if (kind === 'abstain') return 'blue';
  return 'gray';
};

const formatVoteTime = (value) => {
  if (!value) return '';
  const asNumber = Number(value);
  const date = Number.isFinite(asNumber)
    ? new Date(asNumber * (asNumber > 1e12 ? 1 : 1000))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const toReadableLabel = (value) => {
  if (!value || typeof value !== 'string') return 'Unknown';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const proposalStatusColor = (status) => {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  if (normalized === 'active' || normalized === 'voting') return 'green';
  if (normalized === 'ratified' || normalized === 'enacted') return 'blue';
  if (normalized === 'expired') return 'gray';
  if (normalized === 'rejected' || normalized === 'dropped') return 'red';
  return 'purple';
};

const proposalTypeColor = (type) => {
  const normalized = typeof type === 'string' ? type.toLowerCase() : '';
  if (normalized.includes('treasury')) return 'yellow';
  if (normalized.includes('no confidence')) return 'red';
  if (
    normalized.includes('protocol') ||
    normalized.includes('parameter') ||
    normalized.includes('hard fork')
  ) {
    return 'blue';
  }
  if (normalized.includes('constitution') || normalized.includes('committee')) {
    return 'teal';
  }
  if (normalized.includes('info')) return 'gray';
  return 'purple';
};

const formatEpoch = (value) => {
  if (value === null || value === undefined || value === '') return 'Not available';
  return `Epoch ${value}`;
};

const toEpochSortValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const shouldCollapseProposalNarrative = (proposal) => {
  const parts = [proposal.summary, proposal.motivation, proposal.rationale]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n');
  return parts.length > 280;
};

const canVoteOnProposal = (proposal) =>
  Boolean(proposal.txHash) &&
  proposal.certIndex !== null &&
  proposal.certIndex !== undefined;

const DelegateActionCard = ({
  icon,
  title,
  text,
  buttonLabel,
  colorScheme,
  onClick,
  isLoading,
  isDisabled,
}) => {
  const { panelBorder, cardBg, mutedFg } = useSurfaceColors();
  return (
    <Box
      borderWidth="1px"
      borderColor={panelBorder}
      bg={cardBg}
      rounded="2xl"
      p={4}
      display="flex"
      flexDirection="column"
    >
      <HStack spacing={3} align="start">
        <Flex
          rounded="xl"
          bg="blue.400"
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
        colorScheme={colorScheme || 'blue'}
        variant="outline"
        onClick={onClick}
        isLoading={isLoading}
        isDisabled={isDisabled}
      >
        {buttonLabel}
      </Button>
    </Box>
  );
};

const emptyTxState = {
  tx: null,
  fee: '',
  account: null,
  ready: false,
  kind: '',
  keyHashes: [],
  title: '',
  detailLabel: '',
  detailValue: '',
  targetDrep: '',
};

const Governance = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirmRef = React.useRef();
  const settings = useStoreState((state) => state.settings.settings);

  const networkId = settings?.network?.id || 'mainnet';
  const adaSymbol = settings?.adaSymbol || (networkId === 'mainnet' ? '₳' : 't₳');

  const [drepIdInput, setDrepIdInput] = React.useState('');
  const [isBuildingTx, setIsBuildingTx] = React.useState(false);
  const [votingKey, setVotingKey] = React.useState('');
  const [governanceState, setGovernanceState] = React.useState({
    source: '',
    fallbackReason: '',
    proposals: [],
    dreps: [],
    isLoading: true,
    error: '',
  });
  const [drepState, setDrepState] = React.useState({
    checked: false,
    isRegistered: false,
    drepId: '',
    drepIdLegacy: '',
    drepKeyHashHex: '',
  });
  const [votesState, setVotesState] = React.useState({
    isLoading: false,
    votes: [],
    source: '',
    error: '',
  });
  const [voteNonce, setVoteNonce] = React.useState(0);
  const [voteTxState, setVoteTxState] = React.useState(emptyTxState);
  const [expandedProposalIds, setExpandedProposalIds] = React.useState({});
  const [selectedProposalId, setSelectedProposalId] = React.useState('');
  const {
    pageBg,
    pageFg,
    panelBg,
    panelBorder,
    panelShadow,
    cardBg,
    cardHoverBg,
    insetBg,
    mutedFg,
    subtleFg,
    softFg,
    ghostColor,
    inputBg,
    inputBorder,
    placeholder,
    accentLink,
  } = useSurfaceColors();

  const sortedProposals = React.useMemo(() => {
    const statusPriority = {
      active: 0,
      voting: 0,
      ratified: 1,
      enacted: 2,
      expired: 3,
    };

    return [...governanceState.proposals].sort((left, right) => {
      const leftRank = statusPriority[left.status] ?? 4;
      const rightRank = statusPriority[right.status] ?? 4;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return toEpochSortValue(left.expiresAfterEpoch) - toEpochSortValue(right.expiresAfterEpoch);
    });
  }, [governanceState.proposals]);

  const loadGovernance = React.useCallback(
    async (signal) => {
      setGovernanceState((previous) => ({
        ...previous,
        isLoading: true,
        error: '',
      }));

      try {
        const result = await fetchGovernanceOverview(networkId, {
          proposalLimit: 16,
          drepLimit: 16,
          signal,
        });
        if (signal?.aborted) return;

        setExpandedProposalIds({});
        setSelectedProposalId('');
        setGovernanceState({
          source: result.source,
          fallbackReason: result.fallbackReason || '',
          proposals: result.proposals,
          dreps: result.dreps,
          isLoading: false,
          error: '',
        });
      } catch (error) {
        if (signal?.aborted) return;
        setExpandedProposalIds({});
        setSelectedProposalId('');
        setGovernanceState({
          source: '',
          fallbackReason: '',
          proposals: [],
          dreps: [],
          isLoading: false,
          error: error.message || 'Unable to load governance data',
        });
      }
    },
    [networkId]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void loadGovernance(controller.signal);
    return () => controller.abort();
  }, [loadGovernance]);

  // Detect whether this wallet is itself a registered DRep (enables voting).
  React.useEffect(() => {
    const controller = new AbortController();
    setDrepState({
      checked: false,
      isRegistered: false,
      drepId: '',
      drepIdLegacy: '',
      drepKeyHashHex: '',
    });
    (async () => {
      try {
        const ids = await getAccountDRepId();
        const registration = await fetchDRepRegistration(networkId, ids, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setDrepState({
          checked: true,
          isRegistered: Boolean(registration.registered),
          drepId: registration.drepId || ids.drepIdCip129 || '',
          drepIdLegacy: ids.drepIdLegacy || '',
          drepKeyHashHex: ids.drepKeyHashHex || '',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setDrepState({
          checked: true,
          isRegistered: false,
          drepId: '',
          drepIdLegacy: '',
          drepKeyHashHex: '',
        });
      }
    })();
    return () => controller.abort();
  }, [networkId]);

  // Load this DRep's own vote history (only when registered). Refetched after
  // each successful vote via voteNonce.
  React.useEffect(() => {
    if (!drepState.isRegistered || !drepState.drepId) {
      setVotesState({ isLoading: false, votes: [], source: '', error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setVotesState((previous) => ({ ...previous, isLoading: true, error: '' }));
    (async () => {
      try {
        const result = await fetchDRepVotes(
          networkId,
          {
            drepIdCip129: drepState.drepId,
            drepIdLegacy: drepState.drepIdLegacy,
          },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setVotesState({
          isLoading: false,
          votes: result.votes,
          source: result.source,
          error: '',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setVotesState({
          isLoading: false,
          votes: [],
          source: '',
          error: error.message || 'Unable to load voting history',
        });
      }
    })();
    return () => controller.abort();
  }, [networkId, drepState.isRegistered, drepState.drepId, drepState.drepIdLegacy, voteNonce]);

  const showTxError = (heading, message) => {
    toast({
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
            navigator.clipboard.writeText(message);
            toast({ title: 'Copied', status: 'info', duration: 1200 });
            onClose();
          }}
          title="Tap to copy"
          p={4}
        >
          <AlertIcon />
          <Box>
            <Text fontWeight="bold" fontSize="sm">{heading}</Text>
            <Text fontSize="xs">{message}</Text>
          </Box>
        </Alert>
      ),
    });
  };

  const prepareVoteDelegation = async (voteType, keyHashHex = '') => {
    setIsBuildingTx(true);

    try {
      const currentAccount = await getCurrentAccount();
      if (!currentAccount?.paymentKeyHash || !currentAccount?.stakeKeyHash) {
        throw new Error('Current account is missing signing key hashes');
      }

      const currentDelegation = await getDelegation();
      const protocolParameters = await initTx();
      const tx = await voteDelegationTx(
        currentAccount,
        currentDelegation || {},
        protocolParameters,
        voteType,
        keyHashHex
      );

      setVoteTxState({
        tx,
        fee: tx.body().fee().toString(),
        account: currentAccount,
        ready: true,
        kind: 'delegation',
        keyHashes: [currentAccount.paymentKeyHash, currentAccount.stakeKeyHash],
        title: 'Confirm Vote Delegation',
        detailLabel: 'Delegation target',
        detailValue: voteLabel(voteType),
        targetDrep: keyHashHex,
      });

      confirmRef.current?.openModal(currentAccount.index);
    } catch (error) {
      showTxError('Unable to build vote delegation', error.message || 'Transaction preparation failed');
    } finally {
      setIsBuildingTx(false);
    }
  };

  const prepareVote = async (proposal, voteKind) => {
    if (!drepState.isRegistered || !drepState.drepKeyHashHex) return;
    if (!canVoteOnProposal(proposal)) return;

    setVotingKey(`${proposal.id}:${voteKind}`);
    try {
      const currentAccount = await getCurrentAccount();
      if (!currentAccount?.paymentKeyHash) {
        throw new Error('Current account is missing signing key hashes');
      }
      if (isHW(currentAccount.index)) {
        throw new Error(
          'Hardware wallet DRep voting is not supported yet. Use a software (password) wallet to cast votes.'
        );
      }

      const protocolParameters = await initTx();
      const tx = await voteTx(currentAccount, protocolParameters, {
        drepKeyHashHex: drepState.drepKeyHashHex,
        proposalTxHash: proposal.txHash,
        proposalIndex: proposal.certIndex,
        voteKind,
      });

      setVoteTxState({
        tx,
        fee: tx.body().fee().toString(),
        account: currentAccount,
        ready: true,
        kind: 'vote',
        keyHashes: [currentAccount.paymentKeyHash, drepState.drepKeyHashHex],
        title: 'Confirm DRep Vote',
        detailLabel: 'Vote',
        detailValue: `${voteKindLabel(voteKind)} — ${
          proposal.title || truncateMiddle(proposal.id, 12, 8)
        }`,
        targetDrep: '',
      });

      confirmRef.current?.openModal(currentAccount.index);
    } catch (error) {
      showTxError('Unable to build vote', error.message || 'Transaction preparation failed');
    } finally {
      setVotingKey('');
    }
  };

  const handleCustomDrepDelegation = async () => {
    const keyHashHex = normalizeDrepKeyHash(drepIdInput);
    if (!keyHashHex) {
      toast({
        title: 'Invalid DRep key hash',
        description: 'Expected a 56-character hex key hash',
        status: 'warning',
        duration: 3500,
        isClosable: true,
      });
      return;
    }
    await prepareVoteDelegation('key_hash', keyHashHex);
  };

  const toggleProposalSummary = (proposalId) => {
    setExpandedProposalIds((previous) => ({
      ...previous,
      [proposalId]: !previous[proposalId],
    }));
  };

  // Accordion behaviour: opening one proposal closes any other.
  const toggleProposalSelection = (proposalId) => {
    setSelectedProposalId((current) => (current === proposalId ? '' : proposalId));
  };

  const copyProposalId = async (proposalId) => {
    if (!proposalId) return;
    try {
      await navigator.clipboard.writeText(proposalId);
      toast({
        title: 'Proposal ID copied',
        status: 'success',
        duration: 2000,
      });
    } catch {
      toast({
        title: 'Could not copy proposal ID',
        description: 'Clipboard access is unavailable in this context.',
        status: 'warning',
        duration: 2500,
      });
    }
  };

  const isBlockfrost = governanceState.source === 'blockfrost';

  return (
    <Box
      data-testid="governance-page"
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      bg={pageBg}
      color={pageFg}
      px={{ base: 4, md: 6 }}
      py={5}
      pb="calc(6.5rem + env(safe-area-inset-bottom, 0px))"
    >
      <Stack spacing={5} maxW="1100px" mx="auto">
        <Flex align="center" justify="space-between" gap={3}>
          <Button
            leftIcon={<ArrowBackIcon />}
            variant="ghost"
            color={ghostColor}
            onClick={() => navigate('/wallet')}
          >
            Wallet
          </Button>
          <HStack spacing={2}>
            {drepState.isRegistered ? (
              <Badge colorScheme="blue">You're a DRep</Badge>
            ) : null}
            {governanceState.source ? (
              <Tooltip
                label={
                  governanceState.fallbackReason ||
                  (isBlockfrost
                    ? 'Live governance data from Blockfrost'
                    : 'Limited data — configure Blockfrost for full metadata')
                }
                hasArrow
              >
                <Badge colorScheme={sourceBadgeColor(governanceState.source)}>
                  {isBlockfrost ? 'Live' : 'Limited'}
                </Badge>
              </Tooltip>
            ) : null}
            <Badge colorScheme="cyan">{networkId}</Badge>
          </HStack>
        </Flex>

        {/* Hero header — condensed for the popup viewport */}
        <Box
          rounded="3xl"
          p={{ base: 4, md: 6 }}
          bg={panelBg}
          boxShadow={panelShadow}
        >
          <Flex direction={{ base: 'column', md: 'row' }} gap={4} justify="space-between">
            <Box maxW="650px">
              <Badge colorScheme="blue" mb={2}>
                Voting Center
              </Badge>
              <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="black" lineHeight="1.05">
                Delegate your voting power, keep your keys.
              </Text>
              <Text color={softFg} mt={2} fontSize="xs" noOfLines={2}>
                Build and sign on-chain governance transactions with the same secure password
                or hardware wallet flow used everywhere else in Lucem.
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
                <Flex rounded="2xl" bg="blue.400" color="gray.900" boxSize="12" align="center" justify="center">
                  <Icon as={isBlockfrost ? MdOutlineVerified : MdHowToVote} boxSize={7} />
                </Flex>
                <Box>
                  <Text fontSize="xs" color={mutedFg}>
                    Governance data
                  </Text>
                  <Text fontWeight="bold">
                    {isBlockfrost ? 'Live and complete' : 'Limited data'}
                  </Text>
                </Box>
              </HStack>
              <Stack spacing={2} mt={4} fontSize="sm">
                <Flex justify="space-between">
                  <Text color={mutedFg}>Network</Text>
                  <Text fontWeight="semibold" textTransform="capitalize">{networkId}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={mutedFg}>Proposals</Text>
                  <Text fontWeight="semibold">{governanceState.proposals.length}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={mutedFg}>Your DRep</Text>
                  <Text fontWeight="semibold" color={drepState.isRegistered ? accentLink : mutedFg}>
                    {!drepState.checked
                      ? 'Checking…'
                      : drepState.isRegistered
                        ? 'Registered'
                        : 'Not registered'}
                  </Text>
                </Flex>
              </Stack>
            </Box>
          </Flex>
        </Box>

        {/* Delegate Voting Power */}
        <Box
          rounded="3xl"
          bg={panelBg}
          boxShadow={panelShadow}
          p={{ base: 5, md: 6 }}
        >
          <Flex align="center" justify="space-between" mb={4} gap={3}>
            <Text fontSize="xl" fontWeight="black">
              Delegate Voting Power
            </Text>
            <Button
              size="sm"
              leftIcon={<RepeatIcon />}
              variant="ghost"
              color={ghostColor}
              onClick={() => void loadGovernance()}
              isLoading={governanceState.isLoading}
            >
              Refresh
            </Button>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <DelegateActionCard
              icon={MdOutlineGavel}
              title="Always Abstain"
              text="Delegate voting power so your stake always abstains from governance actions."
              buttonLabel="Delegate to Always Abstain"
              onClick={() => void prepareVoteDelegation('always_abstain')}
              isLoading={isBuildingTx}
            />
            <DelegateActionCard
              icon={MdBlock}
              title="Always No Confidence"
              text="Delegate voting power to a permanent no-confidence position on-chain."
              buttonLabel="Delegate to Always No Confidence"
              colorScheme="red"
              onClick={() => void prepareVoteDelegation('always_no_confidence')}
              isLoading={isBuildingTx}
            />
          </SimpleGrid>

          <Box
            mt={4}
            borderWidth="1px"
            borderColor={panelBorder}
            bg={cardBg}
            rounded="2xl"
            p={4}
          >
            <Text fontWeight="bold" mb={1}>
              Delegate to a specific DRep
            </Text>
            <Text fontSize="xs" color={mutedFg} mb={3}>
              Paste a 56-character hex DRep key hash to delegate your vote.
            </Text>
            <Flex gap={2} direction={{ base: 'column', sm: 'row' }}>
              <Input
                placeholder="DRep key hash (56 hex chars)"
                value={drepIdInput}
                onChange={(event) => setDrepIdInput(event.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                focusBorderColor="blue.400"
                _placeholder={{ color: placeholder }}
              />
              <Button
                colorScheme="blue"
                px={8}
                onClick={() => void handleCustomDrepDelegation()}
                isDisabled={!drepIdInput.trim()}
                isLoading={isBuildingTx}
              >
                Delegate
              </Button>
            </Flex>
          </Box>

          {governanceState.dreps.length > 0 && (
            <Box mt={5}>
              <Text fontSize="sm" fontWeight="bold" color={softFg} mb={3}>
                Quick pick from top DReps
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                {governanceState.dreps.slice(0, 6).map((drep) => (
                  <Flex
                    key={drep.id}
                    p={3}
                    rounded="2xl"
                    bg={cardBg}
                    borderWidth="1px"
                    borderColor={panelBorder}
                    align="center"
                    justify="space-between"
                    gap={3}
                    transition="all 0.18s ease"
                    _hover={{ borderColor: 'blue.500', bg: cardHoverBg }}
                  >
                    <Box minW={0}>
                      <Text fontWeight="semibold" isTruncated>
                        {drep.name || truncateMiddle(drep.id)}
                      </Text>
                      <Text color={subtleFg} fontSize="xs" isTruncated>
                        {truncateMiddle(drep.id)}
                        {drep.votingPower ? ` | ${drep.votingPower} lovelace` : ''}
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      variant="outline"
                      flexShrink={0}
                      onClick={() => {
                        setDrepIdInput(drep.keyHashHex);
                        void prepareVoteDelegation('key_hash', drep.keyHashHex);
                      }}
                      isDisabled={!drep.keyHashHex}
                    >
                      Use
                    </Button>
                  </Flex>
                ))}
              </SimpleGrid>
            </Box>
          )}
        </Box>

        {/* Active Governance Proposals */}
        <Box
          rounded="3xl"
          bg={panelBg}
          boxShadow={panelShadow}
          p={{ base: 5, md: 6 }}
        >
          <Flex align="center" justify="space-between" gap={3} mb={2} flexWrap="wrap">
            <Text fontSize="xl" fontWeight="black">
              Active Governance Proposals
            </Text>
            {drepState.isRegistered ? (
              <Badge colorScheme="blue" variant="subtle">
                Voting enabled — you are a DRep
              </Badge>
            ) : null}
          </Flex>
          <Text fontSize="xs" color={mutedFg} mb={2}>
            Titles and descriptions come from on-chain anchors (CIP-108). Blockfrost resolves
            proposal metadata when a project id is configured; Koios may include{' '}
            <Text as="span" fontWeight="semibold">
              meta_json
            </Text>{' '}
            inline.
          </Text>
          <Link
            color={accentLink}
            fontSize="xs"
            display="inline-flex"
            alignItems="center"
            mb={4}
            onClick={() =>
              window.open(
                'https://developers.cardano.org/docs/governance/cardano-governance/governance-actions/',
                '_blank',
                'noopener,noreferrer'
              )
            }
          >
            Learn governance action types <ExternalLinkIcon mx="2px" />
          </Link>

          {governanceState.isLoading ? (
            <Flex justify="center" py={10}>
              <Spinner color="blue.400" speed="0.65s" />
            </Flex>
          ) : governanceState.error ? (
            <Alert status="error" rounded="2xl" bg="red.900" color="white">
              <AlertIcon />
              <Text fontSize="sm">{governanceState.error}</Text>
            </Alert>
          ) : sortedProposals.length > 0 ? (
            <Stack spacing={3}>
              {sortedProposals.map((proposal) => {
                const summaryExpanded = Boolean(expandedProposalIds[proposal.id]);
                const hasSummary = Boolean(
                  proposal.summary && String(proposal.summary).trim()
                );
                const hasMotivation = Boolean(
                  proposal.motivation && String(proposal.motivation).trim()
                );
                const hasRationale = Boolean(
                  proposal.rationale && String(proposal.rationale).trim()
                );
                const hasReadableBody = hasSummary || hasMotivation || hasRationale;
                const canToggleSummary = shouldCollapseProposalNarrative(proposal);
                const votable = canVoteOnProposal(proposal);
                const isOpen = selectedProposalId === proposal.id;

                return (
                  <Box
                    key={proposal.id}
                    rounded="2xl"
                    borderWidth="1px"
                    borderColor={isOpen ? 'blue.400' : panelBorder}
                    bg={cardBg}
                    overflow="hidden"
                  >
                    {/* Compact header — click to expand (accordion) */}
                    <Flex
                      as="button"
                      type="button"
                      width="100%"
                      textAlign="left"
                      align="center"
                      justify="space-between"
                      gap={3}
                      p={4}
                      onClick={() => toggleProposalSelection(proposal.id)}
                      _hover={{ bg: cardHoverBg }}
                      aria-expanded={isOpen}
                    >
                      <Box minW={0}>
                        <HStack spacing={2} mb={1} flexWrap="wrap">
                          <Badge colorScheme={proposalTypeColor(proposal.type)}>
                            {toReadableLabel(proposal.type)}
                          </Badge>
                          <Badge colorScheme={proposalStatusColor(proposal.status)}>
                            {toReadableLabel(proposal.status)}
                          </Badge>
                        </HStack>
                        <Text fontWeight="bold" isTruncated>
                          {proposal.title}
                        </Text>
                        {!isOpen ? (
                          <Text color={subtleFg} fontSize="xs">
                            Voting closes: {formatEpoch(proposal.expiresAfterEpoch)}
                          </Text>
                        ) : null}
                      </Box>
                      <Icon
                        as={isOpen ? ChevronUpIcon : ChevronDownIcon}
                        boxSize={5}
                        color={mutedFg}
                        flexShrink={0}
                      />
                    </Flex>

                    {isOpen ? (
                    <Box
                      px={4}
                      pb={4}
                      borderTopWidth="1px"
                      borderColor={panelBorder}
                    >
                    <Flex align="center" justify="space-between" gap={2} mt={3} mb={2}>
                      <Text color={subtleFg} fontSize="xs" wordBreak="break-all">
                        {truncateMiddle(proposal.id, 14, 10)}
                      </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        color={softFg}
                        flexShrink={0}
                        onClick={() => void copyProposalId(proposal.id)}
                      >
                        Copy ID
                      </Button>
                    </Flex>

                    {hasReadableBody ? (
                      <Box mb={1}>
                        {hasSummary ? (
                          <Text
                            color={pageFg}
                            fontSize="sm"
                            whiteSpace="pre-wrap"
                            mb={hasMotivation || hasRationale ? 2 : 1}
                            noOfLines={summaryExpanded || !canToggleSummary ? undefined : 4}
                          >
                            {proposal.summary}
                          </Text>
                        ) : null}
                        {hasMotivation ? (
                          <Box mb={hasRationale ? 2 : 1}>
                            <Text
                              color={subtleFg}
                              fontSize="xs"
                              fontWeight="semibold"
                              mb={0.5}
                            >
                              Motivation
                            </Text>
                            <Text
                              color={pageFg}
                              fontSize="sm"
                              whiteSpace="pre-wrap"
                              noOfLines={summaryExpanded || !canToggleSummary ? undefined : 3}
                            >
                              {proposal.motivation}
                            </Text>
                          </Box>
                        ) : null}
                        {hasRationale ? (
                          <Box mb={1}>
                            <Text
                              color={subtleFg}
                              fontSize="xs"
                              fontWeight="semibold"
                              mb={0.5}
                            >
                              Rationale
                            </Text>
                            <Text
                              color={pageFg}
                              fontSize="sm"
                              whiteSpace="pre-wrap"
                              noOfLines={summaryExpanded || !canToggleSummary ? undefined : 3}
                            >
                              {proposal.rationale}
                            </Text>
                          </Box>
                        ) : null}
                        {canToggleSummary && (
                          <Button
                            size="xs"
                            variant="link"
                            colorScheme="blue"
                            onClick={() => toggleProposalSummary(proposal.id)}
                          >
                            {summaryExpanded ? 'Show less' : 'Read full proposal text'}
                          </Button>
                        )}
                      </Box>
                    ) : (
                      <Text color={subtleFg} fontSize="sm" mb={1}>
                        No proposal description loaded yet. Add a Blockfrost project id
                        (env{' '}
                        <Text as="span" fontFamily="mono" fontSize="xs">
                          BLOCKFROST_PROJECT_ID_PREPROD
                        </Text>{' '}
                        / Preview / Mainnet, or{' '}
                        <Text as="span" fontFamily="mono" fontSize="xs">
                          BLOCKFROST_PROJECT_ID_*
                        </Text>{' '}
                        in secrets) — it must not be your Koios API key. Or open the anchor link
                        below when present.
                      </Text>
                    )}

                    {proposal.authors && proposal.authors.length > 0 ? (
                      <Text color={subtleFg} fontSize="xs" mb={2}>
                        Authors: {proposal.authors.join(', ')}
                      </Text>
                    ) : null}

                    {proposal.references && proposal.references.length > 0 ? (
                      <Box mt={1} mb={1}>
                        <Text
                          color={subtleFg}
                          fontSize="xs"
                          fontWeight="semibold"
                          mb={1}
                        >
                          References
                        </Text>
                        <Stack align="stretch" spacing={1}>
                          {proposal.references.map((reference, referenceIndex) => (
                            <Link
                              key={`${proposal.id}-ref-${referenceIndex}`}
                              color={accentLink}
                              fontSize="xs"
                              wordBreak="break-word"
                              onClick={() => {
                                const target = reference.uri || reference.label;
                                if (target && /^https?:\/\//i.test(target)) {
                                  window.open(target, '_blank', 'noopener,noreferrer');
                                }
                              }}
                            >
                              {reference.label || reference.uri || 'Link'}
                              {reference.uri &&
                              reference.label &&
                              reference.uri !== reference.label
                                ? ` — ${reference.uri}`
                                : ''}
                            </Link>
                          ))}
                        </Stack>
                      </Box>
                    ) : null}

                    <SimpleGrid
                      columns={{ base: 1, md: 2 }}
                      spacing={1}
                      mt={2}
                      color={subtleFg}
                      fontSize="xs"
                    >
                      <Text>Submitted: {formatEpoch(proposal.submittedEpoch)}</Text>
                      <Text>Voting closes: {formatEpoch(proposal.expiresAfterEpoch)}</Text>
                    </SimpleGrid>

                    {proposal.anchorHash ? (
                      <Text color={subtleFg} fontSize="xs" mt={1}>
                        Anchor hash: {truncateMiddle(proposal.anchorHash, 14, 10)}
                      </Text>
                    ) : null}

                    {proposal.url ? (
                      <Link
                        mt={2}
                        display="inline-flex"
                        alignItems="center"
                        color={accentLink}
                        fontSize="xs"
                        onClick={() =>
                          window.open(proposal.url, '_blank', 'noopener,noreferrer')
                        }
                      >
                        Open proposal details <ExternalLinkIcon mx="2px" />
                      </Link>
                    ) : (
                      <Text color={subtleFg} fontSize="xs" mt={2}>
                        No proposal anchor URL available.
                      </Text>
                    )}

                    {drepState.isRegistered ? (
                      <Box
                        mt={3}
                        pt={3}
                        borderTopWidth="1px"
                        borderColor={panelBorder}
                      >
                        <Text fontSize="xs" fontWeight="semibold" color={accentLink} mb={2}>
                          Cast your DRep vote
                        </Text>
                        {votable ? (
                          <HStack spacing={2}>
                            <Button
                              size="sm"
                              colorScheme="green"
                              flex={1}
                              onClick={() => void prepareVote(proposal, 'yes')}
                              isLoading={votingKey === `${proposal.id}:yes`}
                            >
                              Yes
                            </Button>
                            <Button
                              size="sm"
                              colorScheme="red"
                              flex={1}
                              onClick={() => void prepareVote(proposal, 'no')}
                              isLoading={votingKey === `${proposal.id}:no`}
                            >
                              No
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              colorScheme="blue"
                              flex={1}
                              onClick={() => void prepareVote(proposal, 'abstain')}
                              isLoading={votingKey === `${proposal.id}:abstain`}
                            >
                              Abstain
                            </Button>
                          </HStack>
                        ) : (
                          <Text fontSize="xs" color={placeholder}>
                            Voting needs a governance action id (tx hash + index), which the
                            current data source didn't provide for this proposal.
                          </Text>
                        )}
                      </Box>
                    ) : null}
                    </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Text color={mutedFg} fontSize="sm">
              No proposals returned by the current network API.
            </Text>
          )}
        </Box>

        {/* Your Voting History (only shown when this wallet is a registered DRep) */}
        {drepState.isRegistered ? (
          <Box
            rounded="3xl"
            bg={panelBg}
            borderWidth="1px"
            borderColor={panelBorder}
            p={{ base: 5, md: 6 }}
          >
            <Flex align="center" justify="space-between" gap={3} mb={3} flexWrap="wrap">
              <HStack spacing={2}>
                <Icon as={MdHistory} boxSize={5} color={accentLink} />
                <Text fontSize="xl" fontWeight="black">
                  Your Voting History
                </Text>
              </HStack>
              <Button
                size="sm"
                leftIcon={<RepeatIcon />}
                variant="ghost"
                color={softFg}
                onClick={() => setVoteNonce((nonce) => nonce + 1)}
                isLoading={votesState.isLoading}
              >
                Refresh
              </Button>
            </Flex>

            {votesState.isLoading ? (
              <Flex justify="center" py={8}>
                <Spinner color="blue.400" speed="0.65s" />
              </Flex>
            ) : votesState.error ? (
              <Alert status="error" rounded="2xl" bg="red.900" color="white">
                <AlertIcon />
                <Text fontSize="sm">{votesState.error}</Text>
              </Alert>
            ) : votesState.votes.length > 0 ? (
              <Stack spacing={2}>
                {votesState.votes.map((voteRow, voteIndex) => (
                  <Flex
                    key={`${voteRow.id}-${voteIndex}`}
                    p={3}
                    rounded="xl"
                    bg={cardBg}
                    borderWidth="1px"
                    borderColor={panelBorder}
                    align="center"
                    justify="space-between"
                    gap={3}
                  >
                    <Box minW={0}>
                      <Text fontWeight="semibold" isTruncated>
                        {voteRow.proposalType
                          ? toReadableLabel(voteRow.proposalType)
                          : 'Governance action'}
                      </Text>
                      <Text color={subtleFg} fontSize="xs" isTruncated>
                        {voteRow.proposalId
                          ? truncateMiddle(voteRow.proposalId, 12, 8)
                          : voteRow.txHash
                            ? `tx ${truncateMiddle(voteRow.txHash, 10, 6)}`
                            : ''}
                        {formatVoteTime(voteRow.blockTime)
                          ? ` · ${formatVoteTime(voteRow.blockTime)}`
                          : ''}
                      </Text>
                    </Box>
                    <Badge colorScheme={voteResultColor(voteRow.vote)} flexShrink={0}>
                      {voteResultLabel(voteRow.vote)}
                    </Badge>
                  </Flex>
                ))}
              </Stack>
            ) : (
              <Text color={mutedFg} fontSize="sm">
                No votes recorded yet for your DRep. Votes appear here a few
                minutes after they are confirmed on-chain.
              </Text>
            )}
          </Box>
        ) : null}
      </Stack>

      <ConfirmModal
        ref={confirmRef}
        ready={voteTxState.ready}
        title={voteTxState.title || 'Confirm Transaction'}
        sign={async (password, hw) => {
          const txHex = Buffer.from(voteTxState.tx.to_bytes()).toString('hex');
          const keyHashes = voteTxState.keyHashes;

          if (hw) {
            if (voteTxState.kind === 'vote') {
              throw new Error(
                'Hardware wallet DRep voting is not supported yet. Use a software (password) wallet to cast votes.'
              );
            }
            if (hw.device === HW.trezor) {
              return createTab(TAB.trezorTx, `?tx=${txHex}`);
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex,
                keyHashes,
                partialSign: false,
              });
            }
            return signAndSubmitHW(voteTxState.tx, {
              keyHashes,
              account: voteTxState.account,
              hw,
            });
          }

          return signAndSubmit(
            voteTxState.tx,
            {
              keyHashes,
              accountIndex: voteTxState.account.index,
            },
            password
          );
        }}
        onConfirm={(status, result) => {
          if (status === true) {
            toast({
              title: voteTxState.kind === 'vote' ? 'Vote submitted' : 'Vote delegation submitted',
              description:
                voteTxState.kind === 'vote'
                  ? 'Your governance vote transaction was sent.'
                  : 'Your governance delegation transaction was sent.',
              status: 'success',
              duration: 4500,
            });
            if (voteTxState.kind === 'vote') {
              // Give the chain a moment, then refresh vote history.
              setTimeout(() => setVoteNonce((nonce) => nonce + 1), 4000);
            }
          } else if (result === ERROR.fullMempool) {
            showTxError('Transaction failed', 'Mempool is full, please retry in a moment.');
          } else {
            const message =
              (result && result.message) ||
              (voteTxState.kind === 'vote'
                ? 'Unable to submit vote transaction.'
                : 'Unable to submit vote delegation transaction.');
            showTxError('Transaction failed', String(message));
          }
          confirmRef.current?.closeModal();
          setVoteTxState(emptyTxState);
        }}
        info={
          <Box
            width="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Text fontSize="sm" mb={2} textAlign="center">
              {voteTxState.detailLabel || 'Detail'}: {voteTxState.detailValue}
            </Text>
            {voteTxState.targetDrep ? (
              <Text fontSize="xs" color="gray.500" mb={2} wordBreak="break-all" textAlign="center">
                {voteTxState.targetDrep}
              </Text>
            ) : null}
            <HStack spacing={1}>
              <Text fontWeight="bold" fontSize="sm">
                Fee:
              </Text>
              <UnitDisplay
                quantity={voteTxState.fee}
                decimals={6}
                symbol={adaSymbol}
              />
            </HStack>
          </Box>
        }
      />
    </Box>
  );
};

export default Governance;
