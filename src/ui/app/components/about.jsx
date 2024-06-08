import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useColorModeValue,
  Image,
  Text,
  Box,
  Link,
} from '@chakra-ui/react';

import LogoWhite from '../../../assets/img/logoWhite.svg';
import LogoBlack from '../../../assets/img/logo.svg';
import IOHKWhite from '../../../assets/img/iohkWhite.svg';
import IOHKBlack from '../../../assets/img/iohk.svg';
import HodlerLogo from '../../../assets/img/Hodler_Green_Icon_round.png';
import TermsOfUse from './termsOfUse';
import PrivacyPolicy from './privacyPolicy';
import { useCaptureEvent } from '../../../features/analytics/hooks';
import { Events } from '../../../features/analytics/events';

const { version } = require('../../../../package.json');

const About = React.forwardRef((props, ref) => {
  const capture = useCaptureEvent();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const Logo = useColorModeValue(LogoBlack, LogoWhite);
  const IOHK = useColorModeValue(IOHKWhite, IOHKBlack);

  const termsRef = React.useRef();
  const privacyPolRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
    closeModal() {
      onClose();
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
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="md">About</ModalHeader>
          <ModalCloseButton />
          <ModalBody
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Image
              cursor="pointer"
              onClick={() => window.open('https://www.hodlerstaking.com/')}
              width="90px"
              src={Logo}
            />
            <Box height="4" />
            <Text fontSize="sm">{version}</Text>
            <Box height="6" />
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
            >
              <Text fontSize="xs">
                Created by{' '}
                <span
                  onClick={() => window.open('https://www.hodlerstaking.com/')}
                  style={{ textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Hodler Services
                </span>
              </Text>
              <Box height="4" />
              <Image
                cursor="pointer"
                width="66px"
                onClick={() => window.open('https://www.hodlerstaking.com/')}
                src={HodlerLogo}
              />
            </Box>
            <Box height="4" />
            {/* Footer */}
            <Box>
              <Link
                onClick={() => {
                  capture(Events.SettingsTermsAndConditionsClick);
                  termsRef.current.openModal();
                }}
                color="GrayText"
              >
                Terms of use
              </Link>
              <span> | </span>
              <Link
                onClick={() => privacyPolRef.current.openModal()}
                color="GrayText"
              >
                Privacy Policy
              </Link>
            </Box>
            <Box height="2" />
          </ModalBody>
        </ModalContent>
      </Modal>
      <TermsOfUse ref={termsRef} />
      <PrivacyPolicy ref={privacyPolRef} />
    </>
  );
});

export default About;
