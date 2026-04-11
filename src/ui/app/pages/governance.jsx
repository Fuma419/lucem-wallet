import React, { useState, useEffect } from 'react';
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
} from '@chakra-ui/react';
import { ChevronLeftIcon } from '@chakra-ui/icons';

import {
  getCurrentAccount,
  getDelegation,
} from '../../../api/extension';
import { koiosRequestEnhanced } from '../../../api/util';
import { initTx, voteDelegationTx } from '../../../api/extension/wallet';

const Governance = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [drepId, setDrepId] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [fetchingProposals, setFetchingProposals] = useState(true);

  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    setFetchingProposals(true);
    try {
      const data = await koiosRequestEnhanced('/proposal_list');
      if (Array.isArray(data)) {
        setProposals(data.slice(0, 10)); // Just top 10 for demo
      }
    } catch (e) {
      console.error('Failed to fetch proposals', e);
    } finally {
      setFetchingProposals(false);
    }
  };

  const handleVoteDelegation = async (type, hash = '') => {
    setLoading(true);
    try {
      const currentAccount = await getCurrentAccount();
      const currentDelegation = await getDelegation(currentAccount.rewardAddr);
      const params = await initTx();
      
      await voteDelegationTx(currentAccount, currentDelegation, params, type, hash);

      toast({
        title: 'Transaction Built',
        description: 'Vote Delegation Transaction built successfully! (Signing step requires ConfirmModal)',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });

    } catch (e) {
      toast({
        title: 'Error',
        description: e.message || 'Failed to delegate',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex direction="column" minH="100vh" bg="gray.50">
      <Flex align="center" p={4} bg="white" shadow="sm">
        <IconButton
          icon={<ChevronLeftIcon />}
          onClick={() => navigate('/wallet')}
          variant="ghost"
          aria-label="Back"
        />
        <Heading size="md" ml={2}>Voting Portal</Heading>
      </Flex>

      <Box p={4}>
        <VStack spacing={6} align="stretch">
          <Box bg="white" p={4} rounded="md" shadow="sm">
            <Heading size="sm" mb={4}>Delegate to DRep</Heading>
            <VStack spacing={3}>
              <Button 
                w="full" 
                colorScheme="blue" 
                isLoading={loading}
                onClick={() => handleVoteDelegation('always_abstain')}
              >
                Delegate to Abstain
              </Button>
              <Button 
                w="full" 
                colorScheme="orange" 
                isLoading={loading}
                onClick={() => handleVoteDelegation('always_no_confidence')}
              >
                Delegate to No Confidence
              </Button>
              <Flex w="full" gap={2}>
                <Input 
                  placeholder="DRep Key Hash (Hex)" 
                  value={drepId} 
                  onChange={(e) => setDrepId(e.target.value)}
                />
                <Button 
                  colorScheme="purple" 
                  isLoading={loading}
                  onClick={() => handleVoteDelegation('key_hash', drepId)}
                  isDisabled={!drepId}
                >
                  Delegate
                </Button>
              </Flex>
            </VStack>
          </Box>

          <Box bg="white" p={4} rounded="md" shadow="sm">
            <Heading size="sm" mb={4}>Active Proposals</Heading>
            {fetchingProposals ? (
              <Flex justify="center" p={4}><Spinner /></Flex>
            ) : proposals.length > 0 ? (
              <VStack spacing={3} align="stretch">
                {proposals.map((prop, idx) => (
                  <Box key={idx} p={3} borderWidth={1} rounded="md">
                    <Text fontWeight="bold">Proposal {prop.proposal_id.slice(0, 8)}...</Text>
                    <Text fontSize="sm" color="gray.600">
                      Type: {prop.proposal_type || prop.type || '—'}
                    </Text>
                    <Button size="sm" mt={2} colorScheme="teal" isDisabled>Vote (Coming Soon)</Button>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text>No active proposals found.</Text>
            )}
          </Box>
        </VStack>
      </Box>
    </Flex>
  );
};

export default Governance;
