import {
  Box,
  Button,
  Flex,
  Switch,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import React from 'react';
import useSurfaceColors from '../hooks/useSurfaceColors';

/** Field + button tokens scoped to Settings (supports light mode). */
export function useSettingsChrome() {
  const inputBg = useColorModeValue('white', 'black');
  const border = useColorModeValue('gray.300', 'whiteAlpha.300');
  const inputFg = useColorModeValue('gray.900', 'white');
  const placeholder = useColorModeValue('blackAlpha.500', 'whiteAlpha.500');
  const hoverBorder = useColorModeValue('gray.400', 'whiteAlpha.400');
  const primaryBg = useColorModeValue('gray.200', 'gray.800');
  const primaryFg = useColorModeValue('gray.900', 'white');
  const primaryHover = useColorModeValue('gray.300', 'gray.700');
  const primaryActive = primaryHover;
  const segmentTrack = useColorModeValue(
    'rgba(15, 23, 42, 0.06)',
    'rgba(255, 255, 255, 0.06)'
  );
  const segmentActiveBg = useColorModeValue('white', 'whiteAlpha.200');
  const segmentActiveFg = useColorModeValue('gray.900', 'white');
  const segmentIdleFg = useColorModeValue('gray.600', 'whiteAlpha.700');
  const segmentShadow = useColorModeValue(
    '0 1px 3px rgba(15, 23, 42, 0.12)',
    '0 1px 3px rgba(0, 0, 0, 0.35)'
  );
  const rowDivider = useColorModeValue('blackAlpha.100', 'whiteAlpha.100');

  const inputProps = {
    bg: inputBg,
    borderColor: border,
    color: inputFg,
    _placeholder: { color: placeholder },
    _hover: { borderColor: hoverBorder },
  };

  const primaryButtonProps = {
    size: 'md',
    h: '12',
    rounded: 'xl',
    bg: primaryBg,
    color: primaryFg,
    fontWeight: 'semibold',
    _hover: { bg: primaryHover },
    _active: { bg: primaryActive },
  };

  return {
    inputProps,
    primaryButtonProps,
    segmentTrack,
    segmentActiveBg,
    segmentActiveFg,
    segmentIdleFg,
    segmentShadow,
    rowDivider,
  };
}

export function SettingsPanel({ title, description, children, testId }) {
  const { pageFg, mutedFg } = useSurfaceColors();
  return (
    <Box
      className="lucem-inset-surface"
      rounded="3xl"
      p={{ base: 4, md: 5 }}
      data-testid={testId}
    >
      {title ? (
        <Text
          fontSize="md"
          fontWeight="bold"
          color={pageFg}
          letterSpacing="tight"
          mb={description ? 1 : 4}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text fontSize="sm" color={mutedFg} mb={4}>
          {description}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

/** Single boolean control style for all Settings toggles. */
export function SettingsSwitch({
  isChecked,
  onChange,
  isDisabled,
  'aria-label': ariaLabel,
}) {
  return (
    <Switch
      size="md"
      colorScheme="yellow"
      isChecked={Boolean(isChecked)}
      isDisabled={isDisabled}
      onChange={(e) => onChange?.(e.target.checked)}
      aria-label={ariaLabel}
    />
  );
}

export function SettingsToggleRow({
  label,
  hint,
  isChecked,
  onChange,
  isDisabled,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
  testId,
}) {
  const { softFg, subtleFg } = useSurfaceColors();
  return (
    <Flex
      align="center"
      justify="space-between"
      gap={4}
      w="full"
      data-testid={dataTestId || testId}
    >
      <Box flex="1" minW={0}>
        <Text color={softFg} fontWeight="semibold" fontSize="sm">
          {label}
        </Text>
        {hint ? (
          <Text color={subtleFg} fontSize="xs" mt={1} lineHeight="short">
            {hint}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>
        <SettingsSwitch
          isChecked={isChecked}
          onChange={onChange}
          isDisabled={isDisabled}
          aria-label={ariaLabel || label}
        />
      </Box>
    </Flex>
  );
}

export function SettingsChoiceField({ label, children }) {
  const { mutedFg } = useSurfaceColors();
  return (
    <Box w="full">
      <Text color={mutedFg} fontWeight="semibold" fontSize="sm" mb={2}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

/** Stack of preference rows with hairline dividers. */
export function SettingsFieldStack({ children }) {
  const { rowDivider } = useSettingsChrome();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Box w="full">
      {items.map((child, index) => (
        <Box
          key={child.key || index}
          pt={index === 0 ? 0 : 4}
          mt={index === 0 ? 0 : 4}
          borderTopWidth={index === 0 ? 0 : '1px'}
          borderColor={rowDivider}
        >
          {child}
        </Box>
      ))}
    </Box>
  );
}

export function SegmentedChoice({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
}) {
  const {
    segmentTrack,
    segmentActiveBg,
    segmentActiveFg,
    segmentIdleFg,
    segmentShadow,
  } = useSettingsChrome();

  return (
    <Flex
      role="radiogroup"
      aria-label={ariaLabel}
      w="full"
      p="1"
      rounded="xl"
      bg={segmentTrack}
      gap={1}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Button
            key={opt.value}
            flex={1}
            size="sm"
            h="9"
            rounded="lg"
            variant="unstyled"
            fontWeight="semibold"
            fontSize="sm"
            bg={selected ? segmentActiveBg : 'transparent'}
            color={selected ? segmentActiveFg : segmentIdleFg}
            boxShadow={selected ? segmentShadow : 'none'}
            onClick={() => onChange(opt.value)}
            aria-checked={selected}
            role="radio"
          >
            {opt.label}
          </Button>
        );
      })}
    </Flex>
  );
}
