import { useColorModeValue } from '@chakra-ui/react';

/**
 * Shared light/dark surface tokens for full-page flows (staking, governance).
 * Dark: elevated gray panels on near-black so cards stay readable.
 * Light: white/gray panels with dark text (pages previously ignored color mode).
 */
export default function useSurfaceColors() {
  return {
    pageBg: useColorModeValue('gray.100', 'black'),
    pageFg: useColorModeValue('gray.900', 'white'),
    panelBg: useColorModeValue('white', 'gray.700'),
    panelBorder: useColorModeValue('gray.300', 'whiteAlpha.300'),
    cardBg: useColorModeValue('gray.100', 'gray.600'),
    cardHoverBg: useColorModeValue('gray.200', 'gray.500'),
    insetBg: useColorModeValue('gray.200', 'blackAlpha.400'),
    mutedFg: useColorModeValue('gray.600', 'whiteAlpha.700'),
    subtleFg: useColorModeValue('gray.500', 'whiteAlpha.600'),
    softFg: useColorModeValue('gray.700', 'whiteAlpha.800'),
    ghostColor: useColorModeValue('gray.700', 'whiteAlpha.800'),
    inputBg: useColorModeValue('white', 'gray.600'),
    inputBorder: useColorModeValue('gray.300', 'whiteAlpha.300'),
    placeholder: useColorModeValue('gray.500', 'whiteAlpha.500'),
    accentLink: useColorModeValue('blue.600', 'blue.200'),
    yellowLink: useColorModeValue('yellow.700', 'yellow.200'),
    poolIdleBg: useColorModeValue('gray.100', 'gray.600'),
    poolIdleFg: useColorModeValue('gray.900', 'white'),
    poolIdleHover: useColorModeValue('gray.200', 'gray.500'),
    progressTrack: useColorModeValue('blackAlpha.200', 'whiteAlpha.300'),
    metricBg: useColorModeValue('blackAlpha.50', 'whiteAlpha.200'),
  };
}
