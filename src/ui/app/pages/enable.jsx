import { CheckIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Text, Image, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import { setWhitelisted } from '../../../api/extension';
import { APIError } from '../../../config/config';
import platform from '../../../platform';

import Account from '../components/account';

const Enable = ({ request, controller }) => {
  const background = useColorModeValue('blue.100', 'gray.900');
  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      position="relative"
      w="full"
      maxW="100%"
      className="lucem-wallet-main-column"
    >
      <Account />
      <Box flex="1" minH={0} overflowY="auto" w="full" px={4} pb={4}>
        <Box h={6} />
        <Flex
          direction="column"
          align="center"
          justify="flex-start"
          maxW="420px"
          mx="auto"
        >
          <Box
            width={10}
            height={10}
            background={background}
            rounded={'xl'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <Image
              draggable={false}
              width={6}
              height={6}
              src={platform.icons.getFaviconUrl(request.origin)}
            />
          </Box>
          <Box height="3" />
          <Text fontWeight="bold" textAlign="center" px={2}>
            {request.origin.split('//')[1]}
          </Text>
          <Box h={8} />
          <Box>This app would like to:</Box>
          <Box h={4} />
          <Box
            p={6}
            background={background}
            rounded="xl"
            display={'flex'}
            justifyContent={'center'}
            flexDirection={'column'}
            w="full"
          >
            <Box display={'flex'} alignItems={'center'}>
              <CheckIcon mr="3" color={'yellow'} boxSize={4} />{' '}
              <Box fontWeight={'bold'}>View your balance and addresses</Box>
            </Box>
            <Box h={4} />
            <Box display={'flex'} alignItems={'center'}>
              <CheckIcon mr="3" color={'yellow'} boxSize={4} />{' '}
              <Box fontWeight={'bold'}>Request approval for transactions</Box>
            </Box>
          </Box>
          <Box h={6} />
          <Box color={'GrayText'} textAlign="center" px={2}>
            Only connect with sites you trust
          </Box>
        </Flex>
      </Box>
      <Flex
        flexShrink={0}
        w="full"
        px={2}
        py={3}
        pb="calc(0.75rem + env(safe-area-inset-bottom, 0px))"
        borderTopWidth="1px"
        borderTopColor="whiteAlpha.100"
        align="center"
        justify="center"
        flexWrap="wrap"
        gap={2}
      >
        <Button
          height={'50px'}
          width={{ base: '42%', sm: '180px' }}
          minW="140px"
          onClick={async () => {
            await controller.returnData({ error: APIError.Refused });
            window.close();
          }}
        >
          Cancel
        </Button>
        <Button
          height={'50px'}
          width={{ base: '42%', sm: '180px' }}
          minW="140px"
          colorScheme="yellow"
          onClick={async () => {
            await setWhitelisted(request.origin);
            await controller.returnData({ data: true });
            window.close();
          }}
        >
          Access
        </Button>
      </Flex>
    </Box>
  );
};

export default Enable;
