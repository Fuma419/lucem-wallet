import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import UnitDisplay from './unitDisplay';

/**
 * One row per chain. Live sources show a native amount; disconnected
 * sources (Bitcoin / Solana until those wallets exist) stay labeled only.
 */
const PortfolioChainList = ({ positions }) => {
  if (!positions?.length) return null;
  return (
    <Flex
      className="lucem-portfolio"
      data-testid="wallet-portfolio"
      wrap="wrap"
      justify="center"
      align="center"
      gap="0.35rem 0.75rem"
      mt={1}
      role="list"
      aria-label="Balances by chain"
    >
      {positions.map((position) => (
        <Box
          key={position.chainId}
          className="lucem-portfolio-chain"
          data-testid={`wallet-portfolio-${position.chainId}`}
          data-status={position.status}
          role="listitem"
        >
          <Text as="span" className="lucem-portfolio-chain-label">
            {position.label}
          </Text>
          {position.status === 'live' ? (
            <UnitDisplay
              hide
              className="lucem-portfolio-chain-amount"
              fontSize="inherit"
              quantity={position.quantityAtomic}
              decimals={position.decimals}
              symbol={position.symbol}
            />
          ) : (
            <Text as="span" className="lucem-portfolio-chain-status">
              Not imported
            </Text>
          )}
        </Box>
      ))}
    </Flex>
  );
};

export default PortfolioChainList;
