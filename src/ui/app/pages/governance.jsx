import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  VStack,
  Heading,
  useToast,
  IconButton,
  Spinner,
  HStack,
  Badge,
  Tooltip,
  Link,
  SimpleGrid,
} from '@chakra-ui/react';
import { ChevronLeftIcon, RepeatIcon } from '@chakra-ui/icons';
import { useStoreState } from 'easy-peasy';

import ConfirmModal from '../components/confirmModal';
import UnitDisplay from '../components/unitDisplay';
import {
  createTab,
  getCurrentAccount,
  getDelegation,
  openKeystoneSignTxTab,
} from '../../../api/extension';
import {
  initTx,
  signAndSubmit,
  signAndSubmitHW,
  voteDelegationTx,
} from '../../../api/extension/wallet';
import { fetchGovernanceOverview, normalizeDrepKeyHash } from '../../../api/governance';
import { ERROR, HW, TAB } from '../../../config/config';

const sourceBadgeColor = (source) =>
  source === 'blockfrost' ? 'green' : 'purple';

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

const addFourPoint = (baseSize) => `calc(${baseSize} + 4pt)`;

const votingFontSize = {
  xs: addFourPoint('var(--chakra-fontSizes-xs)'),
  sm: addFourPoint('var(--chakra-fontSizes-sm)'),
  headingSm: addFourPoint('1rem'),
  headingMd: addFourPoint('1.25rem'),
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
  const [governanceState, setGovernanceState] = React.useState({
    source: '',
    fallbackReason: '',
    proposals: [],
    dreps: [],
    isLoading: true,
    error: '',
  });
  const [voteTxState, setVoteTxState] = React.useState({
    tx: null,
    fee: '',
    account: null,
    ready: false,
    voteType: '',
    targetDrep: '',
  });
  const [expandedProposalIds, setExpandedProposalIds] = React.useState({});

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
        voteType,
        targetDrep: keyHashHex,
      });

      confirmRef.current?.openModal(currentAccount.index);
    } catch (error) {
      toast({
        title: 'Unable to build vote delegation',
        description: error.message || 'Transaction preparation failed',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsBuildingTx(false);
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

  return (
    <>
      <Box
        minH="100vh"
        sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
        bg="black"
      >
        <Box className="lucem-wallet-main-column" px={{ base: 3, md: 4 }} pb={6}>
          <Flex
            align="center"
            justify="space-between"
            pt="calc(env(safe-area-inset-top, 0px) + 1rem)"
            pb={4}
          >
            <HStack spacing={2}>
              <IconButton
                icon={<ChevronLeftIcon />}
                onClick={() => navigate('/wallet')}
                variant="ghost"
                aria-label="Back"
                color="white"
              />
              <Heading size="md" color="white" fontSize={votingFontSize.headingMd}>
                Voting
              </Heading>
            </HStack>
            <HStack spacing={2}>
              {governanceState.source ? (
                <Tooltip label={governanceState.fallbackReason || ''} hasArrow>
                  <Badge
                    colorScheme={sourceBadgeColor(governanceState.source)}
                    fontSize={votingFontSize.xs}
                  >
                    {governanceState.source === 'blockfrost'
                      ? 'Blockfrost'
                      : 'Koios fallback'}
                  </Badge>
                </Tooltip>
              ) : null}
              <Badge colorScheme="cyan" fontSize={votingFontSize.xs}>
                {networkId}
              </Badge>
            </HStack>
          </Flex>

          <VStack spacing={4} align="stretch">
            <Box
              bg="rgba(16, 16, 20, 0.95)"
              border="1px solid rgba(140, 140, 180, 0.35)"
              rounded="xl"
              p={4}
            >
              <Flex align="center" justify="space-between" mb={3}>
                <Heading size="sm" color="white" fontSize={votingFontSize.headingSm}>
                  Delegate Voting Power
                </Heading>
                <Button
                  size="xs"
                  fontSize={votingFontSize.xs}
                  leftIcon={<RepeatIcon />}
                  variant="ghost"
                  color="gray.300"
                  onClick={() => void loadGovernance()}
                  isLoading={governanceState.isLoading}
                >
                  Refresh
                </Button>
              </Flex>

              <Text fontSize={votingFontSize.sm} color="gray.300" mb={3}>
                Build and sign an on-chain vote delegation certificate for this wallet.
              </Text>

              <VStack spacing={2} align="stretch">
                <Button
                  size="sm"
                  fontSize={votingFontSize.sm}
                  colorScheme="blue"
                  onClick={() => void prepareVoteDelegation('always_abstain')}
                  isLoading={isBuildingTx}
                >
                  Delegate to Always Abstain
                </Button>
                <Button
                  size="sm"
                  fontSize={votingFontSize.sm}
                  colorScheme="orange"
                  onClick={() => void prepareVoteDelegation('always_no_confidence')}
                  isLoading={isBuildingTx}
                >
                  Delegate to Always No Confidence
                </Button>
                <Flex gap={2}>
                  <Input
                    placeholder="DRep key hash (56 hex chars)"
                    value={drepIdInput}
                    onChange={(event) => setDrepIdInput(event.target.value)}
                    size="sm"
                    fontSize={votingFontSize.sm}
                    bg="rgba(255, 255, 255, 0.05)"
                    borderColor="whiteAlpha.300"
                    color="white"
                    _placeholder={{ color: 'gray.400' }}
                  />
                  <Button
                    size="sm"
                    fontSize={votingFontSize.sm}
                    colorScheme="purple"
                    onClick={() => void handleCustomDrepDelegation()}
                    isDisabled={!drepIdInput.trim()}
                    isLoading={isBuildingTx}
                  >
                    Delegate
                  </Button>
                </Flex>
              </VStack>

              {governanceState.dreps.length > 0 && (
                <Box mt={4}>
                  <Text fontSize={votingFontSize.xs} color="gray.400" mb={2}>
                    Quick pick from top DReps
                  </Text>
                  <VStack spacing={2} align="stretch">
                    {governanceState.dreps.slice(0, 5).map((drep) => (
                      <Flex
                        key={drep.id}
                        p={2}
                        rounded="md"
                        bg="rgba(255, 255, 255, 0.04)"
                        border="1px solid rgba(255, 255, 255, 0.08)"
                        align="center"
                        justify="space-between"
                      >
                        <Box minW={0} mr={2}>
                          <Text color="white" fontSize={votingFontSize.sm} isTruncated>
                            {drep.name || truncateMiddle(drep.id)}
                          </Text>
                          <Text color="gray.400" fontSize={votingFontSize.xs}>
                            {truncateMiddle(drep.id)} {drep.votingPower ? `| ${drep.votingPower} lovelace` : ''}
                          </Text>
                        </Box>
                        <Button
                          size="xs"
                          fontSize={votingFontSize.xs}
                          colorScheme="purple"
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
                  </VStack>
                </Box>
              )}
            </Box>

            <Box
              bg="rgba(16, 16, 20, 0.95)"
              border="1px solid rgba(140, 140, 180, 0.35)"
              rounded="xl"
              p={4}
            >
              <Heading size="sm" color="white" mb={3} fontSize={votingFontSize.headingSm}>
                Active Governance Proposals
              </Heading>
              <Text fontSize={votingFontSize.xs} color="gray.400" mb={3}>
                Titles and descriptions come from on-chain anchors (CIP-108). Blockfrost resolves
                proposal metadata when a project id is configured; Koios may include{' '}
                <Text as="span" fontWeight="semibold">
                  meta_json
                </Text>{' '}
                inline.
              </Text>
              <Link
                color="cyan.300"
                fontSize={votingFontSize.xs}
                display="inline-block"
                mb={4}
                onClick={() =>
                  window.open(
                    'https://developers.cardano.org/docs/governance/cardano-governance/governance-actions/',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                Learn governance action types
              </Link>

              {governanceState.isLoading ? (
                <Flex justify="center" py={8}>
                  <Spinner />
                </Flex>
              ) : governanceState.error ? (
                <Text color="red.300" fontSize={votingFontSize.sm}>
                  {governanceState.error}
                </Text>
              ) : sortedProposals.length > 0 ? (
                <VStack spacing={3} align="stretch">
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

                    return (
                      <Box
                        key={proposal.id}
                        p={3}
                        rounded="md"
                        border="1px solid rgba(255, 255, 255, 0.12)"
                        bg="rgba(255, 255, 255, 0.03)"
                      >
                        <Flex align="start" justify="space-between" gap={2} mb={1}>
                          <HStack spacing={2} flexWrap="wrap">
                            <Badge
                              colorScheme={proposalTypeColor(proposal.type)}
                              fontSize={votingFontSize.xs}
                            >
                              {toReadableLabel(proposal.type)}
                            </Badge>
                            <Badge
                              colorScheme={proposalStatusColor(proposal.status)}
                              fontSize={votingFontSize.xs}
                            >
                              {toReadableLabel(proposal.status)}
                            </Badge>
                          </HStack>
                          <Button
                            size="xs"
                            fontSize={votingFontSize.xs}
                            variant="ghost"
                            color="gray.300"
                            onClick={() => void copyProposalId(proposal.id)}
                          >
                            Copy ID
                          </Button>
                        </Flex>

                        <Text color="white" fontWeight="bold" fontSize={votingFontSize.sm} mb={1}>
                          {proposal.title}
                        </Text>
                        <Text color="gray.400" fontSize={votingFontSize.xs} mb={2}>
                          {truncateMiddle(proposal.id, 14, 10)}
                        </Text>

                        {hasReadableBody ? (
                          <Box mb={1}>
                            {hasSummary ? (
                              <Text
                                color="gray.300"
                                fontSize={votingFontSize.sm}
                                whiteSpace="pre-wrap"
                                mb={hasMotivation || hasRationale ? 2 : 1}
                                noOfLines={
                                  summaryExpanded || !canToggleSummary ? undefined : 4
                                }
                              >
                                {proposal.summary}
                              </Text>
                            ) : null}
                            {hasMotivation ? (
                              <Box mb={hasRationale ? 2 : 1}>
                                <Text
                                  color="gray.500"
                                  fontSize={votingFontSize.xs}
                                  fontWeight="semibold"
                                  mb={0.5}
                                >
                                  Motivation
                                </Text>
                                <Text
                                  color="gray.300"
                                  fontSize={votingFontSize.sm}
                                  whiteSpace="pre-wrap"
                                  noOfLines={
                                    summaryExpanded || !canToggleSummary ? undefined : 3
                                  }
                                >
                                  {proposal.motivation}
                                </Text>
                              </Box>
                            ) : null}
                            {hasRationale ? (
                              <Box mb={1}>
                                <Text
                                  color="gray.500"
                                  fontSize={votingFontSize.xs}
                                  fontWeight="semibold"
                                  mb={0.5}
                                >
                                  Rationale
                                </Text>
                                <Text
                                  color="gray.300"
                                  fontSize={votingFontSize.sm}
                                  whiteSpace="pre-wrap"
                                  noOfLines={
                                    summaryExpanded || !canToggleSummary ? undefined : 3
                                  }
                                >
                                  {proposal.rationale}
                                </Text>
                              </Box>
                            ) : null}
                            {canToggleSummary && (
                              <Button
                                size="xs"
                                fontSize={votingFontSize.xs}
                                variant="link"
                                colorScheme="cyan"
                                onClick={() => toggleProposalSummary(proposal.id)}
                              >
                                {summaryExpanded ? 'Show less' : 'Read full proposal text'}
                              </Button>
                            )}
                          </Box>
                        ) : (
                          <Text color="gray.500" fontSize={votingFontSize.sm} mb={1}>
                            No proposal description in API metadata yet. Use “Open proposal details”
                            when an anchor URL is available, or configure Blockfrost to load CIP-108
                            JSON.
                          </Text>
                        )}

                        {proposal.authors && proposal.authors.length > 0 ? (
                          <Text color="gray.500" fontSize={votingFontSize.xs} mb={2}>
                            Authors: {proposal.authors.join(', ')}
                          </Text>
                        ) : null}

                        {proposal.references && proposal.references.length > 0 ? (
                          <Box mt={1} mb={1}>
                            <Text
                              color="gray.500"
                              fontSize={votingFontSize.xs}
                              fontWeight="semibold"
                              mb={1}
                            >
                              References
                            </Text>
                            <VStack align="stretch" spacing={1}>
                              {proposal.references.map((reference, referenceIndex) => (
                                <Link
                                  key={`${proposal.id}-ref-${referenceIndex}`}
                                  color="cyan.300"
                                  fontSize={votingFontSize.xs}
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
                            </VStack>
                          </Box>
                        ) : null}

                        <SimpleGrid
                          columns={{ base: 1, md: 2 }}
                          spacing={1}
                          mt={2}
                          color="gray.400"
                          fontSize={votingFontSize.xs}
                        >
                          <Text>Submitted: {formatEpoch(proposal.submittedEpoch)}</Text>
                          <Text>Voting closes: {formatEpoch(proposal.expiresAfterEpoch)}</Text>
                        </SimpleGrid>

                        {proposal.anchorHash ? (
                          <Text color="gray.500" fontSize={votingFontSize.xs} mt={1}>
                            Anchor hash: {truncateMiddle(proposal.anchorHash, 14, 10)}
                          </Text>
                        ) : null}

                        {proposal.url ? (
                          <Link
                            mt={2}
                            display="inline-block"
                            color="cyan.300"
                            fontSize={votingFontSize.xs}
                            onClick={() =>
                              window.open(proposal.url, '_blank', 'noopener,noreferrer')
                            }
                          >
                            Open proposal details
                          </Link>
                        ) : (
                          <Text color="gray.500" fontSize={votingFontSize.xs} mt={2}>
                            No proposal anchor URL available.
                          </Text>
                        )}
                      </Box>
                    );
                  })}
                </VStack>
              ) : (
                <Text color="gray.300" fontSize={votingFontSize.sm}>
                  No proposals returned by the current network API.
                </Text>
              )}
            </Box>
          </VStack>
        </Box>
      </Box>

      <ConfirmModal
        ref={confirmRef}
        ready={voteTxState.ready}
        title="Confirm Vote Delegation"
        sign={async (password, hw) => {
          const txHex = Buffer.from(voteTxState.tx.to_bytes()).toString('hex');
          const keyHashes = [
            voteTxState.account.paymentKeyHash,
            voteTxState.account.stakeKeyHash,
          ];

          if (hw) {
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
              title: 'Vote delegation submitted',
              description: 'Your governance delegation transaction was sent.',
              status: 'success',
              duration: 4500,
            });
          } else if (result === ERROR.fullMempool) {
            toast({
              title: 'Transaction failed',
              description: 'Mempool is full, please retry in a moment.',
              status: 'error',
              duration: 3500,
            });
          } else {
            toast({
              title: 'Transaction failed',
              description: 'Unable to submit vote delegation transaction.',
              status: 'error',
              duration: 3500,
            });
          }
          confirmRef.current?.closeModal();
          setVoteTxState({
            tx: null,
            fee: '',
            account: null,
            ready: false,
            voteType: '',
            targetDrep: '',
          });
        }}
        info={
          <Box
            width="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Text fontSize={votingFontSize.sm} mb={2} textAlign="center">
              Delegation target: {voteLabel(voteTxState.voteType)}
            </Text>
            {voteTxState.targetDrep ? (
              <Text fontSize={votingFontSize.xs} color="gray.500" mb={2}>
                {voteTxState.targetDrep}
              </Text>
            ) : null}
            <HStack spacing={1}>
              <Text fontWeight="bold" fontSize={votingFontSize.sm}>
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
    </>
  );
};

export default Governance;
