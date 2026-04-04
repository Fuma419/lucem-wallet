import { Box, Flex, Text, Image } from '@chakra-ui/react';
import React from 'react';

import BannerBlack from '../../../assets/img/bannerBlack.png';

const NoWallet = () => {
  return (
    <Flex
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      w="full"
      maxW="100%"
      direction="column"
      align="center"
      justify="space-between"
      position="relative"
      px={4}
      pt="calc(1rem + env(safe-area-inset-top, 0px))"
      pb="calc(2rem + env(safe-area-inset-bottom, 0px))"
      className="lucem-wallet-main-column"
    >
      <Box pt={4}>
        <Image draggable={false} width="85px" src={BannerBlack} />
      </Box>
      <Flex direction="column" align="center" flex="1" justify="center" gap={2}>
        <Text fontWeight="bold" color="GrayText">
          No Wallet
        </Text>
      </Flex>
      <Box maxW="300px" w="full">
        <Text textAlign="center" fontSize="sm">
          Open the panel at the top right in order to create a wallet.
        </Text>
      </Box>
    </Flex>
  );
};

export default NoWallet;
