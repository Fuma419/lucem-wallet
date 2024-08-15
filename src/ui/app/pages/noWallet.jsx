import { Box, Text, Image, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import { Backpack } from 'react-kawaii';

import BannerBlack from '../../../assets/img/bannerBlack.svg';

const NoWallet = () => {
  return (
    <Box
      height="100vh"
      width="full"
      display="flex"
      alignItems="center"
      flexDirection="column"
      justifyContent="center"
      position="relative"
    >
      <Box position="absolute" top="9">
        <Image draggable={false} width="85px" src={BannerBlack} />
      </Box>
      <Box height="2" />
      <Text fontWeight="bold" color="GrayText">
        No Wallet
      </Text>
      <Box position="absolute" bottom="16" width="300px">
        <Text textAlign="center" fontSize="sm">
          Open the panel at the top right in order to create a wallet.
        </Text>
      </Box>
    </Box>
  );
};

export default NoWallet;
