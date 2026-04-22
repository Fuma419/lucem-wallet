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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
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

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const formatCount = (value) => {
  if (!hasValue(value)) return 'n/a';

  try {
    return BigInt(String(value)).toLocaleString('en-US');
  } catch {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber.toLocaleString('en-US');
    return String(value);
  }
};

const formatPercent = (value) => {
  if (!hasValue(value)) return 'n/a';
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 'n/a';
  return `${asNumber.toFixed(2)}%`;
};

const stringifyDetail = (value) => {
  if (!hasValue(value)) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const roleVoteRows = [
  {
    key: 'yes',
    label: 'Yes',
    countKey: 'yesVotesCast',
    powerKey: 'yesVotePower',
    pctKey: 'yesPct',
    color: 'green.300',
  },
  {
    key: 'abstain',
    label: 'Abstain',
    countKey: 'abstainVotesCast',
    powerKey: 'abstainVotePower',
    pctKey: 'abstainPct',
    color: 'yellow.300',
  },
  {
    key: 'no',
    label: 'No',
    countKey: 'noVotesCast',
    powerKey: 'noVotePower',
    pctKey: 'noPct',
    color: 'red.300',
  },
  {
    key: 'notVoted',
    label: 'Not voted',
    countKey: 'notVotedVotesCast',
    powerKey: 'notVotedVotePower',
    pctKey: 'notVotedPct',
    color: 'gray.300',
  },
];

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
              <Heading size="md" color="white">
                Voting
              </Heading>
            </HStack>
            <HStack spacing={2}>
              {governanceState.source ? (
                <Tooltip label={governanceState.fallbackReason || ''} hasArrow>
                  <Badge colorScheme={sourceBadgeColor(governanceState.source)}>
                    {governanceState.source === 'blockfrost'
                      ? 'Blockfrost'
                      : 'Koios fallback'}
                  </Badge>
                </Tooltip>
              ) : null}
              <Badge colorScheme="cyan">{networkId}</Badge>
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
                <Heading size="sm" color="white">
                  Delegate Voting Power
                </Heading>
                <Button
                  size="xs"
                  leftIcon={<RepeatIcon />}
                  variant="ghost"
                  color="gray.300"
                  onClick={() => void loadGovernance()}
                  isLoading={governanceState.isLoading}
                >
                  Refresh
                </Button>
              </Flex>

              <Text fontSize="sm" color="gray.300" mb={3}>
                Build and sign an on-chain vote delegation certificate for this wallet.
              </Text>

              <VStack spacing={2} align="stretch">
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={() => void prepareVoteDelegation('always_abstain')}
                  isLoading={isBuildingTx}
                >
                  Delegate to Always Abstain
                </Button>
                <Button
                  size="sm"
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
                    bg="rgba(255, 255, 255, 0.05)"
                    borderColor="whiteAlpha.300"
                    color="white"
                    _placeholder={{ color: 'gray.400' }}
                  />
                  <Button
                    size="sm"
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
                  <Text fontSize="xs" color="gray.400" mb={2}>
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
                          <Text color="white" fontSize="sm" isTruncated>
                            {drep.name || truncateMiddle(drep.id)}
                          </Text>
                          <Text color="gray.400" fontSize="xs">
                            {truncateMiddle(drep.id)} {drep.votingPower ? `| ${drep.votingPower} lovelace` : ''}
                          </Text>
                        </Box>
                        <Button
                          size="xs"
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
              <Heading size="sm" color="white" mb={3}>
                Active Governance Proposals
              </Heading>

              {governanceState.isLoading ? (
                <Flex justify="center" py={8}>
                  <Spinner />
                </Flex>
              ) : governanceState.error ? (
                <Text color="red.300" fontSize="sm">
                  {governanceState.error}
                </Text>
              ) : governanceState.proposals.length > 0 ? (
                <VStack spacing={3} align="stretch">
                  {governanceState.proposals.map((proposal) => {
                    const timelineItems = [
                      ['Submitted epoch', proposal.submittedEpoch],
                      ['Expires epoch', proposal.expiresAfterEpoch],
                      ['Expiration epoch', proposal.expirationEpoch],
                      ['Ratified epoch', proposal.ratifiedEpoch],
                      ['Enacted epoch', proposal.enactedEpoch],
                      ['Dropped epoch', proposal.droppedEpoch],
                      ['Expired epoch', proposal.expiredEpoch],
                    ].filter(([, value]) => value !== null && value !== undefined);

                    const metadataTextSections = [
                      ['Abstract', proposal.abstract || proposal.summary],
                      ['Motivation', proposal.motivation],
                      ['Rationale', proposal.rationale],
                    ].filter(([, value]) => Boolean(value));

                    const referenceList = Array.isArray(proposal.references)
                      ? proposal.references
                      : [];
                    const actionDetailsText = stringifyDetail(proposal.actionDetails);
                    const voteSections = [
                      ['DReps', proposal.voteSummary?.drep],
                      ['SPOs', proposal.voteSummary?.pool],
                      ['Constitutional Committee', proposal.voteSummary?.committee],
                    ].filter(([, value]) => Boolean(value));

                    return (
                      <Box
                        key={proposal.id}
                        p={3}
                        rounded="md"
                        border="1px solid rgba(255, 255, 255, 0.12)"
                        bg="rgba(255, 255, 255, 0.03)"
                      >
                        <HStack spacing={2} mb={1} flexWrap="wrap">
                          <Badge colorScheme="purple">{proposal.type}</Badge>
                          <Badge colorScheme={proposal.status === 'active' ? 'green' : 'gray'}>
                            {proposal.status}
                          </Badge>
                          {proposal.voteSummary?.epoch !== null &&
                            proposal.voteSummary?.epoch !== undefined && (
                              <Badge colorScheme="cyan">
                                Vote epoch {proposal.voteSummary.epoch}
                              </Badge>
                            )}
                        </HStack>
                        <Text color="white" fontWeight="bold" fontSize="sm" mb={1}>
                          {proposal.title}
                        </Text>
                        <Text color="gray.400" fontSize="xs" mb={1}>
                          {truncateMiddle(proposal.id, 18, 12)}
                        </Text>
                        {proposal.legacyId && (
                          <Text color="gray.500" fontSize="xs" mb={1}>
                            Legacy ID: {truncateMiddle(proposal.legacyId, 16, 12)}
                          </Text>
                        )}
                        {(proposal.summary || proposal.abstract) && (
                          <Text color="gray.300" fontSize="sm" mb={2} noOfLines={3}>
                            {proposal.abstract || proposal.summary}
                          </Text>
                        )}
                        {timelineItems.length > 0 && (
                          <HStack spacing={3} color="gray.400" fontSize="xs" flexWrap="wrap">
                            {timelineItems.map(([label, value]) => (
                              <Text key={`${proposal.id}-${label}`}>
                                {label}: {value}
                              </Text>
                            ))}
                          </HStack>
                        )}

                        <Accordion allowToggle mt={3}>
                          <AccordionItem border="1px solid rgba(255,255,255,0.10)" rounded="md">
                            <AccordionButton _hover={{ bg: 'rgba(255,255,255,0.04)' }}>
                              <Box as="span" flex="1" textAlign="left" color="gray.200" fontSize="sm">
                                Full details and vote breakdown
                              </Box>
                              <AccordionIcon color="gray.300" />
                            </AccordionButton>
                            <AccordionPanel pb={3}>
                              <VStack spacing={3} align="stretch">
                                <Box>
                                  <Text color="gray.400" fontSize="xs" mb={1}>
                                    Governance Action ID
                                  </Text>
                                  <Text color="white" fontSize="xs" wordBreak="break-all">
                                    {proposal.canonicalId || proposal.id}
                                  </Text>
                                </Box>

                                {proposal.legacyId && (
                                  <Box>
                                    <Text color="gray.400" fontSize="xs" mb={1}>
                                      Legacy Governance Action ID
                                    </Text>
                                    <Text color="white" fontSize="xs" wordBreak="break-all">
                                      {proposal.legacyId}
                                    </Text>
                                  </Box>
                                )}

                                {proposal.url && (
                                  <Link
                                    color="cyan.300"
                                    fontSize="xs"
                                    onClick={() => window.open(proposal.url)}
                                  >
                                    Open proposal anchor / metadata
                                  </Link>
                                )}

                                {(proposal.metadataHash || proposal.metadataLanguage || proposal.metadataIsValid !== null) && (
                                  <Box>
                                    <Text color="gray.400" fontSize="xs" mb={1}>
                                      Metadata
                                    </Text>
                                    <VStack spacing={1} align="stretch">
                                      {proposal.metadataHash && (
                                        <Text color="gray.300" fontSize="xs" wordBreak="break-all">
                                          Hash: {proposal.metadataHash}
                                        </Text>
                                      )}
                                      {proposal.metadataLanguage && (
                                        <Text color="gray.300" fontSize="xs">
                                          Language: {proposal.metadataLanguage}
                                        </Text>
                                      )}
                                      {proposal.metadataIsValid !== null && (
                                        <Text color="gray.300" fontSize="xs">
                                          Valid: {proposal.metadataIsValid ? 'yes' : 'no'}
                                        </Text>
                                      )}
                                    </VStack>
                                  </Box>
                                )}

                                {metadataTextSections.map(([label, value]) => (
                                  <Box
                                    key={`${proposal.id}-${label}`}
                                    as="details"
                                    rounded="md"
                                    p={2}
                                    bg="rgba(255,255,255,0.04)"
                                  >
                                    <Box as="summary" cursor="pointer">
                                      <Text color="gray.200" fontSize="xs" fontWeight="semibold">
                                        {label}
                                      </Text>
                                    </Box>
                                    <Text
                                      color="gray.300"
                                      fontSize="xs"
                                      whiteSpace="pre-wrap"
                                      mt={2}
                                    >
                                      {value}
                                    </Text>
                                  </Box>
                                ))}

                                {referenceList.length > 0 && (
                                  <Box>
                                    <Text color="gray.400" fontSize="xs" mb={1}>
                                      References
                                    </Text>
                                    <VStack spacing={1} align="stretch">
                                      {referenceList.map((reference, index) => (
                                        <Link
                                          key={`${proposal.id}-reference-${index}`}
                                          color="cyan.300"
                                          fontSize="xs"
                                          onClick={() => window.open(reference.url || reference.label)}
                                          wordBreak="break-all"
                                        >
                                          {reference.label}
                                        </Link>
                                      ))}
                                    </VStack>
                                  </Box>
                                )}

                                {actionDetailsText && (
                                  <Box
                                    as="details"
                                    rounded="md"
                                    p={2}
                                    bg="rgba(255,255,255,0.04)"
                                  >
                                    <Box as="summary" cursor="pointer">
                                      <Text color="gray.200" fontSize="xs" fontWeight="semibold">
                                        Governance action payload
                                      </Text>
                                    </Box>
                                    <Box
                                      as="pre"
                                      color="gray.300"
                                      fontSize="10px"
                                      mt={2}
                                      whiteSpace="pre-wrap"
                                      wordBreak="break-word"
                                    >
                                      {actionDetailsText}
                                    </Box>
                                  </Box>
                                )}

                                {voteSections.length > 0 ? (
                                  <VStack spacing={2} align="stretch">
                                    <Text color="gray.400" fontSize="xs">
                                      Current vote counts
                                    </Text>
                                    {voteSections.map(([roleLabel, roleVotes]) => (
                                      <Box
                                        key={`${proposal.id}-${roleLabel}`}
                                        rounded="md"
                                        border="1px solid rgba(255,255,255,0.08)"
                                        bg="rgba(255,255,255,0.02)"
                                        p={2}
                                      >
                                        <Text color="white" fontSize="xs" mb={1}>
                                          {roleLabel}
                                        </Text>
                                        <VStack spacing={1} align="stretch">
                                          {roleVoteRows.map((voteRow) => (
                                            <Flex
                                              key={`${proposal.id}-${roleLabel}-${voteRow.key}`}
                                              align="center"
                                              justify="space-between"
                                              gap={2}
                                            >
                                              <Text color={voteRow.color} fontSize="xs" minW="62px">
                                                {voteRow.label}
                                              </Text>
                                              <Text
                                                color="gray.300"
                                                fontSize="xs"
                                                textAlign="right"
                                                flex="1"
                                              >
                                                votes {formatCount(roleVotes[voteRow.countKey])}
                                              </Text>
                                              <Text
                                                color="gray.300"
                                                fontSize="xs"
                                                textAlign="right"
                                                flex="1"
                                              >
                                                power {formatCount(roleVotes[voteRow.powerKey])}
                                              </Text>
                                              <Text color="gray.300" fontSize="xs" minW="70px" textAlign="right">
                                                {formatPercent(roleVotes[voteRow.pctKey])}
                                              </Text>
                                            </Flex>
                                          ))}
                                          {roleLabel === 'DReps' && (
                                            <>
                                              <Text color="gray.400" fontSize="xs">
                                                Always abstain power:{' '}
                                                {formatCount(roleVotes.alwaysAbstainVotePower)}
                                              </Text>
                                              <Text color="gray.400" fontSize="xs">
                                                Always no-confidence power:{' '}
                                                {formatCount(roleVotes.alwaysNoConfidenceVotePower)}
                                              </Text>
                                            </>
                                          )}
                                          {roleLabel === 'SPOs' && (
                                            <>
                                              <Text color="gray.400" fontSize="xs">
                                                Passive always abstain assigned:{' '}
                                                {formatCount(roleVotes.passiveAlwaysAbstainVotesAssigned)}
                                              </Text>
                                              <Text color="gray.400" fontSize="xs">
                                                Passive always abstain power:{' '}
                                                {formatCount(roleVotes.passiveAlwaysAbstainVotePower)}
                                              </Text>
                                              <Text color="gray.400" fontSize="xs">
                                                Passive always no-confidence assigned:{' '}
                                                {formatCount(roleVotes.passiveAlwaysNoConfidenceVotesAssigned)}
                                              </Text>
                                              <Text color="gray.400" fontSize="xs">
                                                Passive always no-confidence power:{' '}
                                                {formatCount(roleVotes.passiveAlwaysNoConfidenceVotePower)}
                                              </Text>
                                            </>
                                          )}
                                        </VStack>
                                      </Box>
                                    ))}
                                  </VStack>
                                ) : (
                                  <Text color="gray.400" fontSize="xs">
                                    Vote summary is currently unavailable for this governance action.
                                  </Text>
                                )}
                              </VStack>
                            </AccordionPanel>
                          </AccordionItem>
                        </Accordion>
                      </Box>
                    );
                  })}
                </VStack>
              ) : (
                <Text color="gray.300" fontSize="sm">
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
            <Text fontSize="sm" mb={2} textAlign="center">
              Delegation target: {voteLabel(voteTxState.voteType)}
            </Text>
            {voteTxState.targetDrep ? (
              <Text fontSize="xs" color="gray.500" mb={2}>
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
    </>
  );
};

export default Governance;
