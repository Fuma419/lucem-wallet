// Welcome.js
import React from 'react';
import {
  Box,
  Button,
  Flex,
  Image,
  Link,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import Logo from '../../../assets/img/logo.png';
import { hasStoredAccounts } from '../../../api/extension';
import { useNavigate } from 'react-router-dom';
import { WalletSetupButtons } from '../components/walletSetupFlow';

const Welcome = () => {
  const navigate = useNavigate();
  const pageBg = useColorModeValue('#f4f6fb', '#121212');
  const pageFg = useColorModeValue('#1a2233', '#ffffff');
  const [hasWallet, setHasWallet] = React.useState(false);

  React.useEffect(() => {
    hasStoredAccounts().then(setHasWallet);
  }, []);

  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      bg={pageBg}
      color={pageFg}
      className="lucem-wallet-main-column lucem-welcome-root"
    >
      <Box
        flexShrink={0}
        pt="max(1rem, env(safe-area-inset-top, 0px))"
        px={4}
        pb={1}
        overflow="visible"
        textAlign="center"
      >
        {/*
          Use logo.png (padded mark) with object-fit contain so the full Lucem
          orb + glow stays visible. bannerBlack.png runs glow to the file edges
          and looked cropped on this screen.
        */}
        <Image
          draggable={false}
          src={Logo}
          alt="Lucem"
          mx="auto"
          width={{ base: '160px', sm: '180px' }}
          maxW="min(180px, 70vw)"
          height="auto"
          objectFit="contain"
          objectPosition="center"
        />
      </Box>
      {hasWallet && (
        <Flex
          flex="1"
          minH={0}
          direction="column"
          align="center"
          justify="center"
          px={4}
        >
          <Button
            className="button enter-wallet"
            onClick={() => {
              navigate('/wallet');
            }}
          >
            Enter
          </Button>
        </Flex>
      )}
      <Flex
        flex="1"
        minH={0}
        direction="column"
        align="center"
        justify="center"
        px={4}
        py={6}
        overflowY="auto"
      >
        <Text className="message">Wallet Setup</Text>
        <Box height="6" />
        <WalletSetupButtons showBackupImport />
      </Flex>
      <Box
        flexShrink={0}
        pb="calc(1rem + env(safe-area-inset-bottom, 0px))"
        pt={2}
        px={4}
        textAlign="center"
        fontSize="xs"
        color="gray.500"
      >
        <Link
          onClick={() =>
            window.open('https://www.hodlerstaking.com/lucem-wallet')
          }
        >
          Lucem Wallet
        </Link>
      </Box>
    </Box>
  );
};

export default Welcome;
