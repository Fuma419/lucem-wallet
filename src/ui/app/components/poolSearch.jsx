import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Spinner,
  Text,
  VStack,
  HStack,
  Avatar,
  Icon,
} from '@chakra-ui/react';
import { SearchIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons';
import { searchPools } from '../../../api/extension';
import UnitDisplay from './unitDisplay';
import { useStoreState } from 'easy-peasy';

const PoolSearch = ({
  selectedPoolId,
  onSelect,
  inputFontSize = 'sm',
  bodyFontSize = 'sm',
  metaFontSize = 'xs',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const settings = useStoreState((state) => state.settings.settings);
  const wrapperRef = useRef(null);

  // Debounce search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const pools = await searchPools(query);
        setResults(pools);
      } catch (e) {
        console.error('Failed to search pools:', e);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <Box position="relative" ref={wrapperRef} width="100%">
      <InputGroup size="md">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <Input
          placeholder="Search by Ticker or Pool ID"
          value={query}
          fontSize={inputFontSize}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (selectedPoolId && e.target.value !== selectedPoolId) {
              onSelect('');
            }
          }}
          onFocus={() => setIsOpen(true)}
          borderColor="whiteAlpha.300"
          _hover={{ borderColor: 'purple.400' }}
          _focus={{ borderColor: 'purple.500', boxShadow: '0 0 0 1px purple.500' }}
        />
        {loading && (
          <InputRightElement>
            <Spinner size="sm" color="purple.400" />
          </InputRightElement>
        )}
        {!loading && query && (
          <InputRightElement cursor="pointer" onClick={() => {
            setQuery('');
            onSelect('');
            setResults([]);
          }}>
            <CloseIcon boxSize={3} color="gray.400" />
          </InputRightElement>
        )}
      </InputGroup>

      {isOpen && (query.length >= 2 || results.length > 0) && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          mt={1}
          bg="gray.800"
          borderWidth={1}
          borderColor="whiteAlpha.200"
          borderRadius="md"
          maxH="300px"
          overflowY="auto"
          zIndex={10}
          boxShadow="xl"
        >
          {loading && results.length === 0 ? (
            <Box p={4} textAlign="center">
              <Text fontSize={bodyFontSize} color="gray.400">Searching...</Text>
            </Box>
          ) : results.length === 0 ? (
            <Box p={4} textAlign="center">
              <Text fontSize={bodyFontSize} color="gray.400">No pools found.</Text>
            </Box>
          ) : (
            <VStack align="stretch" spacing={0} divider={<Box borderBottomWidth={1} borderColor="whiteAlpha.100" />}>
              {results.map((pool) => (
                <Box
                  key={pool.id}
                  p={3}
                  _hover={{ bg: 'whiteAlpha.100', cursor: 'pointer' }}
                  onClick={() => {
                    setQuery(pool.ticker || pool.id);
                    onSelect(pool.id);
                    setIsOpen(false);
                  }}
                  bg={selectedPoolId === pool.id ? 'whiteAlpha.200' : 'transparent'}
                >
                  <HStack justify="space-between">
                    <HStack>
                      <Avatar size="sm" name={pool.ticker} src={pool.homepage ? `${pool.homepage}/favicon.ico` : ''} bg="purple.500" color="white" />
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="bold" fontSize={bodyFontSize}>{pool.ticker}</Text>
                        <Text fontSize={metaFontSize} color="gray.400" isTruncated maxW="150px">{pool.name}</Text>
                      </VStack>
                    </HStack>
                    <VStack align="end" spacing={0}>
                      <Text fontSize={metaFontSize} color="gray.400">Margin: {(pool.margin * 100).toFixed(2)}%</Text>
                      <Text fontSize={metaFontSize} color="gray.400">
                        Pledge: <UnitDisplay quantity={pool.pledge} decimals={6} symbol={settings.adaSymbol} hide />
                      </Text>
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </Box>
      )}
    </Box>
  );
};

export default PoolSearch;
