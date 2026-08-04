import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import React, { useRef } from 'react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import PrivacyPolicy from '../../../ui/app/components/privacyPolicy';
import TermsOfUse from '../../../ui/app/components/termsOfUse';

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
      py={3}
      px={2}
      mx={-2}
      rounded="xl"
      bg="transparent"
      borderWidth={0}
      cursor="pointer"
      transition="background 0.15s ease"
      _hover={{ bg: rowHover }}
      onClick={onClick}
    >
      <Text fontWeight="semibold" color={labelColor} fontSize="sm" textAlign="left">
        {label}
      </Text>
      <ChevronRightIcon color={chevron} boxSize={5} />
    </Box>
  );
}

/** Terms / Privacy rows for the flat Settings page (modals, not nested routes). */
export const LegalSettings = () => {
  const termsRef = useRef<{ openModal: () => void }>();
  const privacyPolicyRef = useRef<{ openModal: () => void }>();
  return (
    <>
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
    </>
  );
};
