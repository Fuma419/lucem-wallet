import { useColorModeValue } from '@chakra-ui/react';

/**
 * Shared light/dark surface tokens for full-page flows (accounts, staking, governance).
 * Avoid Lucem gray.100/900 for page chrome — those mid-tones read too dark in light
 * mode and too light in dark mode. Panels use soft elevation (no hard window borders).
 */
export default function useSurfaceColors() {
  return {
    pageBg: useColorModeValue('#f4f6fb', '#080808'),
    pageFg: useColorModeValue('gray.900', 'white'),
    panelBg: useColorModeValue('rgba(255, 255, 255, 0.92)', '#121212'),
    panelBorder: useColorModeValue('transparent', 'transparent'),
    panelShadow: useColorModeValue(
      '0 18px 48px rgba(15, 23, 42, 0.08), 0 2px 10px rgba(15, 23, 42, 0.04)',
      '0 22px 56px rgba(0, 0, 0, 0.55), 0 2px 12px rgba(0, 0, 0, 0.35)'
    ),
    cardBg: useColorModeValue('rgba(15, 23, 42, 0.04)', 'rgba(255, 255, 255, 0.04)'),
    cardHoverBg: useColorModeValue('rgba(15, 23, 42, 0.08)', 'rgba(255, 255, 255, 0.08)'),
    insetBg: useColorModeValue('rgba(15, 23, 42, 0.05)', 'rgba(0, 0, 0, 0.35)'),
    mutedFg: useColorModeValue('gray.600', 'whiteAlpha.700'),
    subtleFg: useColorModeValue('gray.500', 'whiteAlpha.600'),
    softFg: useColorModeValue('gray.700', 'whiteAlpha.800'),
    ghostColor: useColorModeValue('gray.700', 'whiteAlpha.800'),
    inputBg: useColorModeValue('white', '#1a1a1a'),
    inputBorder: useColorModeValue('blackAlpha.100', 'whiteAlpha.100'),
    placeholder: useColorModeValue('gray.500', 'whiteAlpha.500'),
    accentLink: useColorModeValue('blue.600', 'blue.200'),
    yellowLink: useColorModeValue('yellow.700', 'yellow.200'),
    poolIdleBg: useColorModeValue('rgba(15, 23, 42, 0.04)', 'rgba(255, 255, 255, 0.05)'),
    poolIdleFg: useColorModeValue('gray.900', 'white'),
    poolIdleHover: useColorModeValue('rgba(15, 23, 42, 0.08)', 'rgba(255, 255, 255, 0.1)'),
    progressTrack: useColorModeValue('blackAlpha.200', 'whiteAlpha.300'),
    metricBg: useColorModeValue('blackAlpha.50', 'whiteAlpha.100'),
  };
}
