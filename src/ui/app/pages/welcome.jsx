// Welcome.js
import React from 'react';
import { Backpack } from 'react-kawaii';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Image,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spacer,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import BannerDark from '../../../assets/img/bannerBlack.png'; // Directly using the dark banner
import TermsOfUse from '../components/termsOfUse';
import PrivacyPolicy from '../components/privacyPolicy';
import { ViewIcon, WarningTwoIcon } from '@chakra-ui/icons';
import { createTab, hasStoredAccounts } from '../../../api/extension';
import { useNavigate } from 'react-router-dom';
import { TAB } from '../../../config/config';
import { useAcceptDocs } from '../../../features/terms-and-privacy/hooks';

const Welcome = () => {
  const refWallet = React.useRef();
  const refImport = React.useRef();
  const refHw = React.useRef();
  const navigate = useNavigate();
  const [hasWallet, setHasWallet] = React.useState(false);

  React.useEffect(() => {
    hasStoredAccounts().then(setHasWallet);

    // Dynamically set the theme-color for the dynamic island / notch to match the welcome screen's background (#121212)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const originalColor = metaThemeColor ? metaThemeColor.getAttribute('content') : null;
    
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#121212');
    }

    return () => {
      // Revert to original theme color when leaving the welcome screen
      if (metaThemeColor && originalColor) {
        metaThemeColor.setAttribute('content', originalColor);
      }
    };
  }, []);

  return (
    <>
      <Box
        minH="100vh"
        sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        bg="#121212"
        color="#ffffff"
        className="lucem-wallet-main-column"
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
          {hasWallet && (
            <>
              <Button
                className="button enter-wallet"
                onClick={() => {
                  navigate('/wallet');
                }}
              >
                Enter
              </Button>
              <Box height="6" />
            </>
          )}
          <Text className="message">Wallet Setup</Text>
          <Box height="6" />
          <Button
            className="button new-wallet"
            onClick={() => {
              refWallet.current.openModal();
            }}
          >
            New Wallet
          </Button>
          <Box height="6" />
          <Button
            className="button import-wallet"
            onClick={() => {
              refImport.current.openModal();
            }}
          >
            Import
          </Button>
          <Box height="6" />
          <Button
            className="button hw-wallet"
            onClick={() => {
              refHw.current.openModal();
            }}
          >
            Hardware wallet
          </Button>
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
      <WalletModal ref={refWallet} />
      <ImportModal ref={refImport} />
      <HardwareWalletModal ref={refHw} />
    </>
  );
};

const WalletModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { accepted, setAccepted } = useAcceptDocs();

  const termsRef = React.useRef();
  const privacyPolicyRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));
  return (
    <>
      <Modal className="modal-glow-purple"
        size="xs"
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        blockScrollOnMount={false}
      >
          <ModalOverlay
            style={{
              backgroundColor: 'rgba(220, 27, 250, 0.15)',
              backdropFilter: 'blur(5px)',
            }}/>
        <ModalContent className="modal-glow-purple" backgroundColor="#1a1a1a" >
          <ModalHeader fontSize="md">Create a wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Make sure no one is watching the screen, while the seed phrase is
              visible. <ViewIcon />
            </Text>
            <Box h="4" />
            <Box display="flex" alignItems="center" justifyContent="center">
              <Checkbox colorScheme="purple" onChange={(e) => setAccepted(e.target.checked)}               
              _focus={false}
              />
              <Box w="2" />
              <Text fontWeight={600}>
                I read and accepted the{' '}
                <Link
                  onClick={() => termsRef.current.openModal()}
                  textDecoration="underline"
                  color="purple.700"
                >
                  Terms of use
                </Link>
                <span> and </span>
                <Link
                  onClick={() => privacyPolicyRef.current.openModal()}
                  textDecoration="underline"
                  color="purple.700"
                >
                  Privacy Policy
                </Link>
              </Text>
              <Box h="2" />
            </Box>
          </ModalBody>

          <ModalFooter>
            <Button mr={3} variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              className="button new-wallet"
              isDisabled={!accepted}
              onClick={() => createTab(TAB.createWallet, `?type=generate`)}
            >
              Continue
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <TermsOfUse ref={termsRef} />
      <PrivacyPolicy ref={privacyPolicyRef} />
    </>
  );
});

const ImportModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { accepted, setAccepted } = useAcceptDocs();
  const [selected, setSelected] = React.useState(null);
  const [hasProceeded, setHasProceeded] = React.useState(false);

  const termsRef = React.useRef();
  const privacyPolicyRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));

  const handleContinue = () => {
    const validLengths = [12, 15, 24];
    const seedLength = parseInt(selected, 10);

    if (!validLengths.includes(seedLength)) {
      // Handle invalid seed length
      return;
    }

    setHasProceeded(true);

    // Include seed length in the URL parameters
    createTab(TAB.createWallet, `?type=import&length=${seedLength}`);
  };

  return (
    <>
      <Modal
        size="xs"
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        blockScrollOnMount={false}
      >
        <ModalOverlay
          style={{
            backgroundColor: 'rgba(0, 245, 255, 0.2)',
            backdropFilter: 'blur(5px)',
          }}
        />
        <ModalContent className="modal-glow-cyan" backgroundColor="#1a1a1a">
          <ModalHeader fontSize="md">Import a wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" fontWeight="bold">
              <WarningTwoIcon mr="1" />
              Importing Daedalus or Yoroi
            </Text>
            <Spacer height="1" />
            <Text fontSize="13px">
              Lucem is best experienced when not simultaneously used with Multi-Address wallets 
              like Yoroi/Daedalus. Lucem allows the user to have multiple accounts but
              will only track the first wallet from your imported wallet.
              This might result in partial reflection of assets. To accurately
              reflect your balance, please transfer all assets into your new
              Lucem wallet address using a Multi-Address wallet.{' '}
              <Link
                textDecoration="underline"
                color="cyan.700"
                onClick={() => window.open('https://www.hodlerstaking.com/lucem-wallet')}
              >
                More info
              </Link>
            </Text>
            <Spacer height="4" />
            <Text fontSize="sm">
              Make sure no one is watching the screen, while the seed phrase is
              visible. <ViewIcon />
            </Text>
            <Spacer height="6" />
            <Select
              size="sm"
              rounded="md"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              placeholder="Choose seed phrase length"
              backgroundColor="#2a2a2a"
              color="white"
              focusBorderColor={`cyan.700`}
              borderColor={`cyan.700`}
              isDisabled={hasProceeded} // Disable after proceeding
            >
              <option value="12">12-word seed phrase</option>
              <option value="15">15-word seed phrase</option>
              <option value="24">24-word seed phrase</option>
            </Select>

            <Box h="5" />
            <Box display="flex" alignItems="center" justifyContent="center">
              <Checkbox onChange={(e) => setAccepted(e.target.checked)}               
              isFocusable={false}
              _focusVisible={false}
              colorScheme="cyan"
              />
              <Box w="2" />
              <Text fontWeight={600}>
                I read and accepted the{' '}
                <Link
                  onClick={() => termsRef.current.openModal()}
                  textDecoration="underline"
                  color="cyan.700"
                >
                  Terms of use
                </Link>
                <span> and </span>
                <Link
                  onClick={() => privacyPolicyRef.current.openModal()}
                  textDecoration="underline"
                  color="cyan.700"
                >
                  Privacy Policy
                </Link>
              </Text>
              <Box h="2" />
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              isDisabled={!selected || !accepted}
              className="button import-wallet"
              onClick={handleContinue}
            >
              Continue
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <TermsOfUse ref={termsRef} />
      <PrivacyPolicy ref={privacyPolicyRef} />
    </>
  );
});

const HardwareWalletModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { accepted, setAccepted } = useAcceptDocs();
  const termsRef = React.useRef();
  const privacyPolicyRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));

  return (
    <>
      <Modal
        className="modal-glow-yellow-green"
        size="xs"
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        blockScrollOnMount={false}
      >
        <ModalOverlay
          sx={{
            bg: 'linear-gradient(rgba(206, 250, 0, 0.07), rgba(206, 250, 0, 0.07)), rgba(5, 15, 24, 0.93)',
            backdropFilter: 'blur(10px)',
          }}
        />
        <ModalContent
          className="modal-glow-yellow-green lucem-hardware-welcome-modal"
          bg="#050f18"
          color="whiteAlpha.900"
          borderWidth="1px"
          borderColor="rgba(206, 250, 0, 0.35)"
        >
          <ModalHeader fontSize="md" className="walletTitle" color="white">
            Hardware wallet
          </ModalHeader>
          <ModalCloseButton color="whiteAlpha.700" />
          <ModalBody>
            <Text fontSize="sm" color="whiteAlpha.800">
              Connect a Ledger via Bluetooth (Nano X, Flex, Stax, …), or a Keystone in two steps: by default Lucem uses
              account 0 and Cardano standard derivation; use Advanced in the hardware tab
              for more accounts or Ledger-compatible keys. Scan Lucem&apos;s QR, then
              Keystone&apos;s QR (camera required in the browser for step 2).
            </Text>
            <Box h="4" />
            <Box display="flex" alignItems="center" justifyContent="center">
              <Checkbox
                colorScheme="yellow"
                onChange={(e) => setAccepted(e.target.checked)}
                _focus={false}
              />
              <Box w="2" />
              <Text fontWeight={600} fontSize="sm" color="whiteAlpha.900">
                I read and accepted the{' '}
                <Link
                  onClick={() => termsRef.current.openModal()}
                  textDecoration="underline"
                  color="yellow.300"
                >
                  Terms of use
                </Link>
                <span> and </span>
                <Link
                  onClick={() => privacyPolicyRef.current.openModal()}
                  textDecoration="underline"
                  color="yellow.300"
                >
                  Privacy Policy
                </Link>
              </Text>
            </Box>
          </ModalBody>
          <ModalFooter justifyContent="center" gap={4} pb={4}>
            <Button
              variant="ghost"
              color="whiteAlpha.800"
              _hover={{ bg: 'whiteAlpha.100' }}
              onClick={onClose}
              minW="120px"
            >
              Close
            </Button>
            <Button
              variant="unstyled"
              className="button hw-wallet"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              isDisabled={!accepted}
              onClick={() => createTab(TAB.hw)}
              minW="160px"
              px={8}
            >
              Continue
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <TermsOfUse ref={termsRef} />
      <PrivacyPolicy ref={privacyPolicyRef} />
    </>
  );
});

export default Welcome;
