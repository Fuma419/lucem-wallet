import { useColorModeValue } from '@chakra-ui/react';

/**
 * Shared light/dark surface tokens for full-page flows (accounts, staking, governance).
 * Avoid Lucem gray.100/900 for page chrome — those mid-tones read too dark in light
 * mode and too light in dark mode.
 *
 * Elevation rule: in dark mode a surface that sits on top of another surface is
 * *lighter* than it, never darker. Stacking translucent black (the old insetBg)
 * on a near-black page made nested cards and inputs read as holes, so panels and
 * their contents dissolved into one another.
 */
export default function useSurfaceColors() {
  return {
    pageBg: useColorModeValue('#f4f6fb', '#080808'),
    pageFg: useColorModeValue('gray.900', 'white'),
    panelBg: useColorModeValue('rgba(255, 255, 255, 0.92)', '#121212'),
    panelBorder: useColorModeValue(
      'rgba(15, 23, 42, 0.09)',
      'rgba(255, 255, 255, 0.14)'
    ),
    panelShadow: useColorModeValue(
      '0 18px 48px rgba(15, 23, 42, 0.08), 0 2px 10px rgba(15, 23, 42, 0.04)',
      '0 22px 56px rgba(0, 0, 0, 0.55), 0 2px 12px rgba(0, 0, 0, 0.35)'
    ),
    cardBg: useColorModeValue('rgba(15, 23, 42, 0.04)', 'rgba(255, 255, 255, 0.04)'),
    cardHoverBg: useColorModeValue('rgba(15, 23, 42, 0.08)', 'rgba(255, 255, 255, 0.08)'),
    insetBg: useColorModeValue(
      'rgba(15, 23, 42, 0.05)',
      'rgba(255, 255, 255, 0.055)'
    ),
    mutedFg: useColorModeValue('gray.600', 'whiteAlpha.800'),
    subtleFg: useColorModeValue('gray.500', 'whiteAlpha.700'),
    softFg: useColorModeValue('gray.700', 'whiteAlpha.900'),
    ghostColor: useColorModeValue('gray.700', 'whiteAlpha.900'),
    // Fields keep a modest fill and lean on a visible rim instead: the same input
    // has to read as an input whether it sits on a panel or inside a nested card.
    inputBg: useColorModeValue('white', '#1c1c1c'),
    inputBorder: useColorModeValue('blackAlpha.300', 'whiteAlpha.400'),
    placeholder: useColorModeValue('gray.500', 'whiteAlpha.600'),
    // Disabled CTAs still have to be readable: whiteAlpha.200 on whiteAlpha.500
    // text left labels like "Review transaction" almost invisible.
    disabledBg: useColorModeValue('blackAlpha.100', 'whiteAlpha.300'),
    disabledFg: useColorModeValue('gray.500', 'whiteAlpha.700'),
    accentLink: useColorModeValue('blue.600', 'blue.200'),
    yellowLink: useColorModeValue('yellow.700', 'yellow.200'),
    cyanLink: useColorModeValue('cyan.600', 'cyan.300'),
    poolIdleBg: useColorModeValue('rgba(15, 23, 42, 0.04)', 'rgba(255, 255, 255, 0.05)'),
    poolIdleFg: useColorModeValue('gray.900', 'white'),
    poolIdleHover: useColorModeValue('rgba(15, 23, 42, 0.08)', 'rgba(255, 255, 255, 0.1)'),
    progressTrack: useColorModeValue('blackAlpha.200', 'whiteAlpha.300'),
    metricBg: useColorModeValue('blackAlpha.50', 'whiteAlpha.100'),
  };
}
