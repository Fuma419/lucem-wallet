import React from 'react';
import {
  useColorModeValue,
  Image,
  Text,
  Box,
  Link,
} from '@chakra-ui/react';

import LogoWhite from '../../../assets/img/logoWhite.png';
import LogoBlack from '../../../assets/img/logo.svg';
import IOHKWhite from '../../../assets/img/iohkWhite.svg';
import IOHKBlack from '../../../assets/img/iohk.svg';
import TermsOfUse from './termsOfUse';
import PrivacyPolicy from './privacyPolicy';

const { version } = require('../../../../package.json');

/** Inline About block (logo, version, credits, legal links). */
export const AboutContent = () => {
  const Logo = useColorModeValue(LogoBlack, LogoWhite);
  const IOHK = useColorModeValue(IOHKBlack, IOHKWhite);
  const muted = useColorModeValue('gray.600', 'whiteAlpha.600');
  const termsRef = React.useRef();
  const privacyPolRef = React.useRef();

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
        data-testid="settings-about"
        w="full"
      >
        <Image
          cursor="pointer"
          onClick={() => window.open('https://www.hodlerstaking.com/')}
          width="72px"
          src={Logo}
          alt="Lucem"
        />
        <Box height="3" />
        <Text
          fontSize="xs"
          letterSpacing="0.04em"
          color={muted}
          data-testid="settings-app-version"
        >
          v{version}
        </Text>
        <Box height="4" />
        <Text fontSize="xs" textAlign="center" color={muted}>
          Created by{' '}
          <Text
            as="span"
            onClick={() => window.open('https://www.hodlerstaking.com/')}
            textDecoration="underline"
            cursor="pointer"
          >
            Hodler Staking
          </Text>
          {' '}and{' '}
          <Text
            as="span"
            onClick={() => window.open('https://www.namiwallet.io/')}
            textDecoration="underline"
            cursor="pointer"
          >
            IOG
          </Text>
        </Text>
        <Box height="3" />
        <Image
          cursor="pointer"
          width="56px"
          onClick={() => window.open('https://www.hodlerstaking.com/')}
          src={IOHK}
          alt="IOHK"
        />
        <Box height="3" />
        <Box fontSize="xs">
          <Link
            onClick={() => termsRef.current.openModal()}
            color={muted}
          >
            Terms of use
          </Link>
          <Text as="span" color={muted}>
            {' '}
            |{' '}
          </Text>
          <Link
            onClick={() => privacyPolRef.current.openModal()}
            color={muted}
          >
            Privacy Policy
          </Link>
        </Box>
      </Box>
      <TermsOfUse ref={termsRef} />
      <PrivacyPolicy ref={privacyPolRef} />
    </>
  );
};

export default AboutContent;
