// Welcome.js
import React from 'react';
import {
  Box,
  Button,
  Flex,
  Image,
  Link,
  Text,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import BannerDark from '../../../assets/img/bannerBlack.png'; // Directly using the dark banner
import { hasStoredAccounts } from '../../../api/extension';
import { useNavigate } from 'react-router-dom';
import { WalletSetupButtons } from '../components/walletSetupFlow';

const Welcome = () => {
  const navigate = useNavigate();
  const { colorMode } = useColorMode();
  const pageBg = useColorModeValue('#f4f6fb', '#121212');
  const pageFg = useColorModeValue('#1a2233', '#ffffff');
  const [hasWallet, setHasWallet] = React.useState(false);

  React.useEffect(() => {
    hasStoredAccounts().then(setHasWallet);
  }, []);

  React.useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const originalColor = metaThemeColor
      ? metaThemeColor.getAttribute('content')
      : null;
    const next = colorMode === 'light' ? '#f4f6fb' : '#121212';
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', next);
    }
    return () => {
      if (metaThemeColor && originalColor !== null) {
        metaThemeColor.setAttribute('content', originalColor);
      }
    };
  }, [colorMode]);

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
        textAlign="center"
      >
        <Image
          draggable={false}
          width="150px"
          maxW="min(150px, 72vw)"
          src={BannerDark}
          mx="auto"
          alt=""
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
