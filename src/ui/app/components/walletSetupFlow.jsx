import React from 'react';
import {
  Box,
  Button,
  Checkbox,
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
  Stack,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { ViewIcon, WarningTwoIcon } from '@chakra-ui/icons';
import TermsOfUse from './termsOfUse';
import PrivacyPolicy from './privacyPolicy';
import { createTab } from '../../../api/extension';
import { TAB } from '../../../config/config';
import { useAcceptDocs } from '../../../features/terms-and-privacy/hooks';

/** Create Mnemonic / Import Mnemonic / Import HW — start-screen wallet actions. */
export const WalletSetupButtons = ({
  spacing = 6,
  stackProps = {},
  buttonProps = {},
}) => {
  const refWallet = React.useRef();
  const refImport = React.useRef();
  const refHw = React.useRef();

  return (
    <>
      <Stack
        spacing={spacing}
        align="stretch"
        className="lucem-wallet-setup-actions"
        {...stackProps}
      >
        <Button
          className="button new-wallet"
          onClick={() => refWallet.current.openModal()}
          {...buttonProps}
        >
          Create Mnemonic
        </Button>
        <Button
          className="button import-wallet"
          onClick={() => refImport.current.openModal()}
          {...buttonProps}
        >
          Import Mnemonic
        </Button>
        <Button
          className="button hw-wallet"
          onClick={() => refHw.current.openModal()}
          {...buttonProps}
        >
          Import HW
        </Button>
      </Stack>
      <WalletModal ref={refWallet} />
      <ImportModal ref={refImport} />
      <HardwareWalletModal ref={refHw} />
    </>
  );
};

export const WalletModal = React.forwardRef((props, ref) => {
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
        className="modal-glow-purple"
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
          }}
        />
        <ModalContent className="modal-glow-purple" backgroundColor="#1a1a1a">
          <ModalHeader fontSize="md">Create a wallet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Make sure no one is watching the screen, while the seed phrase is
              visible. <ViewIcon />
            </Text>
            <Box h="4" />
            <Box display="flex" alignItems="center" justifyContent="center">
              <Checkbox
                colorScheme="purple"
                onChange={(e) => setAccepted(e.target.checked)}
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

export const ImportModal = React.forwardRef((props, ref) => {
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
      return;
    }

    setHasProceeded(true);
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
              Lucem is best experienced when not simultaneously used with
              Multi-Address wallets like Yoroi/Daedalus. Lucem allows the user
              to have multiple accounts but will only track the first wallet
              from your imported wallet. This might result in partial
              reflection of assets. To accurately reflect your balance, please
              transfer all assets into your new Lucem wallet address using a
              Multi-Address wallet.{' '}
              <Link
                textDecoration="underline"
                color="cyan.700"
                onClick={() =>
                  window.open('https://www.hodlerstaking.com/lucem-wallet')
                }
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
              isDisabled={hasProceeded}
            >
              <option value="12">12-word seed phrase</option>
              <option value="15">15-word seed phrase</option>
              <option value="24">24-word seed phrase</option>
            </Select>

            <Box h="5" />
            <Box display="flex" alignItems="center" justifyContent="center">
              <Checkbox
                onChange={(e) => setAccepted(e.target.checked)}
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

export const HardwareWalletModal = React.forwardRef((props, ref) => {
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
              Connect a Ledger via Bluetooth (Nano X, Flex, Stax, …), or a
              Keystone in two steps: by default Lucem uses account 0 and
              Cardano standard derivation; use Advanced in the hardware tab for
              more accounts or Ledger-compatible keys. Scan Lucem&apos;s QR,
              then Keystone&apos;s QR (camera required in the browser for step
              2).
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
