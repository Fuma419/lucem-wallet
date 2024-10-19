import React from 'react';
import { Backpack } from 'react-kawaii';
import { Checkbox, Image } from '@chakra-ui/react';
import {
  Box,
  Button,
  Spacer,
  Text,
  Link,
  Select,
  useDisclosure,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from '@chakra-ui/react';
import BannerDark from '../../../assets/img/bannerBlack.png'; // Directly using the dark banner
import TermsOfUse from '../components/termsOfUse';
import PrivacyPolicy from '../components/privacyPolicy';
import { ViewIcon, WarningTwoIcon } from '@chakra-ui/icons';
import { createTab } from '../../../api/extension';
import { TAB } from '../../../config/config';
import { useAcceptDocs } from '../../../features/terms-and-privacy/hooks';

const Welcome = () => {
  const refWallet = React.useRef();
  const refImport = React.useRef();

  return (
    <>
      <Box
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundColor: '#121212', // Ensure dark background
          color: '#ffffff', // Ensure white text
        }}
        position="relative"
      >
        {/* Header */}
        <Box position="absolute" top="9">
          <Image draggable={false} width="150px" src={BannerDark} />
        </Box>
        {/* Footer */}
        <Box position="absolute" bottom="3" fontSize="xs" color="gray.500">
          <Link
            onClick={() => window.open('https://www.hodlerstaking.com/')}
          >
            Lucem Wallet
          </Link>
        </Box>
        <Box height="10"/>
        <Text className="welcome">
          Greetings
        </Text>
        <Box height="6"/>
        <Text className="message">
          Let's setup a wallet.
        </Text>
        <Box height="6"/>
        <Button className="button new-wallet"
          onClick={() => {
            refWallet.current.openModal();
          }}
        >
          New Wallet
        </Button >
        <Box height="6"/>
        <Button className="button import-wallet"
          onClick={() => {
            refImport.current.openModal();
          }}
        >
          Import
        </Button>
      </Box>
      <WalletModal ref={refWallet} />
      <ImportModal ref={refImport} />
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
        size="xs"
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        blockScrollOnMount={false}
      >
        <ModalOverlay            style={{
              backgroundColor: 'rgba(0, 245, 255, 0.2)',
              backdropFilter: 'blur(5px)', // Optional: Add blur for a frosted glass effect
            }}/>
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
              We always recommend creating a new wallet, as Lucem is best
              experienced when not simultaneously used with Yoroi/Daedalus. Lucem
              will not track all addresses associated with your imported wallet,
              and might result in partial reflection of assets. To accurately
              reflect your balance, please transfer all assets into your new
              Lucem wallet.{' '}
              <Link
                textDecoration="underline"
                color="cyan.700"
                onClick={() => window.open('https://www.hodlerstaking.com/')}
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
              onChange={(e) => setSelected(e.target.value)}
              placeholder="Choose seed phrase length"
              backgroundColor="#2a2a2a"
              color="white"
              focusBorderColor={`cyan.700`}  // Dynamic focus border color
              borderColor={`cyan.700`}  // Dynamic border color
            >
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
              onClick={() =>
                createTab(
                  TAB.createWallet,
                  `?type=import&length=${parseInt(selected)}`
                )
              }
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
