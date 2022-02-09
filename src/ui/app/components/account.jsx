import React from 'react';
import { avatarToImage, getCurrentAccount } from '../../../api/extension';
import { Box, Text } from '@chakra-ui/layout';

import BannerDark from '../../../assets/img/cardanoYellow.png';
import BannerLight from '../../../assets/img/cardanoWhite.png';
import { Image, useColorModeValue } from '@chakra-ui/react';
import AvatarLoader from './avatarLoader';

const Account = React.forwardRef((props, ref) => {
  const avatarBg = useColorModeValue('white', 'gray');
  const panelBg = useColorModeValue('yellow.500', 'gray');
  const [account, setAccount] = React.useState(null);
  const Banner = useColorModeValue(BannerLight, BannerDark);
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
      height="16"
      roundedBottom="3xl"
      background={panelBg}
      shadow="md"
      width="full"
      position="relative"
    >
      <Box
        zIndex="2"
        position="absolute"
        top="13px"
        left="6"
        width="10"
        height="10"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Image draggable={false} src={Banner} width="35px" />
      </Box>
      <Box
        zIndex="2"
        position="absolute"
        top="13px"
        right="6"
        rounded="full"
        background={avatarBg}
        width="10"
        height="10"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <AvatarLoader
          avatar={account && account.avatar}
          width="10"
          smallRobot
        />
      </Box>
      <Box
        zIndex="1"
        position="absolute"
        width="full"
        top="20px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="black" fontSize="lg" isTruncated={true} maxWidth="210px">
          {account && account.name}
        </Text>
      </Box>
    </Box>
  );
});

export default Account;
