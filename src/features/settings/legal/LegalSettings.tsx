import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import React, { useRef } from 'react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import PrivacyPolicy from '../../../ui/app/components/privacyPolicy';
import TermsOfUse from '../../../ui/app/components/termsOfUse';

function SettingsPageTitle({ children }: { children: React.ReactNode }) {
  const titleColor = useColorModeValue('gray.900', 'white');
  return (
    <Text
      textAlign="center"
      fontSize="xl"
      fontWeight="bold"
      color={titleColor}
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
  const labelColor = useColorModeValue('gray.900', 'white');
  const chevron = useColorModeValue('blackAlpha.500', 'whiteAlpha.600');
  const rowHover = useColorModeValue('blackAlpha.50', 'whiteAlpha.50');
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
      _hover={{ bg: rowHover }}
      onClick={onClick}
    >
      <Text fontWeight="semibold" color={labelColor} fontSize="md" textAlign="left">
        {label}
      </Text>
      <ChevronRightIcon color={chevron} boxSize={5} />
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
