import React from 'react';
import { getCurrentAccount } from '../../../api/extension';

import Logo from '../../../assets/img/icon-128.svg';
import { Box, Flex, Text, Image, useColorModeValue } from '@chakra-ui/react';
import AvatarLoader from './avatarLoader';

const Account = React.forwardRef(({ leadingSlot, ...props }, ref) => {
  const avatarBg = useColorModeValue('blue.100', 'gray.900');
  const panelBg = useColorModeValue('blue.100', 'gray.800');
  const [account, setAccount] = React.useState(null);

  const initAccount = () =>
    getCurrentAccount().then((account) => setAccount(account));

  React.useImperativeHandle(ref, () => ({
    updateAccount() {
      initAccount();
    },
  }));

  React.useEffect(() => {
    initAccount();
  }, []);

  return (
    <Box
      roundedBottom="3xl"
      background={panelBg}
      shadow="md"
      width="full"
      pt={{
        base: 'max(0.35rem, env(safe-area-inset-top, 0px))',
        md: 2,
      }}
      pb={2}
      px={{ base: 3, md: 4 }}
      {...props}
    >
      <Flex align="center" justify="space-between" gap={2} minH="10">
        {leadingSlot ? (
          <Box flexShrink={0} display="flex" alignItems="center" justifyContent="center">
            {leadingSlot}
          </Box>
        ) : null}
        <Box
          boxSize="10"
          rounded="full"
          overflow="hidden"
          flexShrink={0}
          bg="blackAlpha.400"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image
            draggable={false}
            src={Logo}
            boxSize="9"
            objectFit="contain"
            alt=""
          />
        </Box>
        <Text
          flex="1"
          textAlign="center"
          color="white"
          fontSize="lg"
          fontWeight="medium"
          isTruncated
          minW={0}
          px={1}
        >
          {account && account.name}
        </Text>
        <Box
          boxSize="10"
          rounded="full"
          overflow="hidden"
          flexShrink={0}
          bg={avatarBg}
          position="relative"
        >
          <Box position="absolute" inset={0}>
            <AvatarLoader avatar={account && account.avatar} width="100%" />
          </Box>
        </Box>
      </Flex>
    </Box>
  );
});

export default Account;
