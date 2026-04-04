import {
  Box,
  Flex,
  Link,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Spacer,
  Switch,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import React, { useRef } from 'react';
import { ChevronRightIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import PrivacyPolicy from '../../../ui/app/components/privacyPolicy';
import TermsOfUse from '../../../ui/app/components/termsOfUse';

function SettingsPageTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      textAlign="center"
      fontSize="xl"
      fontWeight="bold"
      color="white"
      letterSpacing="tight"
      mb={6}
      mt={1}
    >
      {children}
    </Text>
  );
}

function SettingsListNavItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      w="full"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      py={4}
      px={4}
      rounded="xl"
      bg="transparent"
      borderWidth={0}
      cursor="pointer"
      transition="background 0.15s ease"
      _hover={{ bg: 'whiteAlpha.50' }}
      onClick={onClick}
    >
      <Text fontWeight="semibold" color="white" fontSize="md" textAlign="left">
        {label}
      </Text>
      <ChevronRightIcon color="whiteAlpha.600" boxSize={5} />
    </Box>
  );
}

export const LegalSettings = () => {
  const termsRef = useRef<{ openModal: () => void }>();
  const privacyPolicyRef = useRef<{ openModal: () => void }>();
  return (
    <>
      <Box w="full" maxW="md" mx="auto" pt={1}>
      <SettingsPageTitle>Legal</SettingsPageTitle>
      {/* <Flex minWidth="65%" padding="0 16px" alignItems="center" gap="2">
        <Text fontSize="16" fontWeight="bold">
          Analytics
          <Popover autoFocus={false}>
            <PopoverTrigger>
              <InfoOutlineIcon
                cursor="pointer"
                color="#4A5568"
                ml="10px"
                width="14px"
                height="14px"
                display="inline-block"
              />
            </PopoverTrigger>
            <PopoverContent>
              <PopoverArrow />
              <PopoverBody>
                <Text
                  color="grey"
                  fontWeight="500"
                  fontSize="14"
                  lineHeight="24px"
                >
                  We collect anonymous information from your browser extension
                  to help us improve the quality and performance of Nami. This
                  may include data about how you use our service, your
                  preferences and information about your system. Read more&nbsp;
                  <Link
                    onClick={() => window.open('https://www.hodlerstaking.com/')}
                    textDecoration="underline"
                  >
                    here
                  </Link>
                  .
                </Text>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        </Text>
        <Spacer />
        <Switch
          isChecked={analytics.consent}
          onChange={() => setAnalyticsConsent(!analytics.consent)}
        />
      </Flex> */}
      <Flex direction="column" gap={2} w="full">
        <SettingsListNavItem
          label="Terms of Use"
          onClick={() => termsRef.current?.openModal()}
        />
        <SettingsListNavItem
          label="Privacy Policy"
          onClick={() => privacyPolicyRef.current?.openModal()}
        />
      </Flex>
      <PrivacyPolicy ref={privacyPolicyRef} />
      <TermsOfUse ref={termsRef} />
      </Box>
    </>
  );
};
