import React from 'react';
import { ChakraProvider, extendTheme, createLocalStorageManager } from '@chakra-ui/react';
import './app/components/styles.css';
import 'focus-visible/dist/focus-visible';
import { AppearancePreferenceProvider } from './appearanceContext';

const scaledFont = (rem) => `calc(${rem} * var(--lucem-font-scale, 1))`;

const chakraLocalStorage = createLocalStorageManager('chakra-ui-color-mode');

/** Chakra localStorage only; platform `STORAGE.colorMode` holds light/dark/system preference. */
export const lucemChakraColorModeManager = {
  ssr: false,
  type: 'localStorage',
  get(initialValue) {
    return chakraLocalStorage.get(initialValue);
  },
  set(value) {
    chakraLocalStorage.set(value);
  },
};

// Define custom sizes for Input components
const inputSizes = {
  sm: {
    borderRadius: 'lg',
  },
  md: {
    borderRadius: 'lg',
  },
};

// Extend Input, Checkbox, Select, Button, and Switch components
const Input = {
  sizes: {
    sm: {
      field: inputSizes.sm,
      addon: inputSizes.sm,
    },
    md: {
      field: inputSizes.md,
      addon: inputSizes.md,
    },
  },
  defaultProps: {
    focusBorderColor: 'yellow.700',
  },
};

const Checkbox = {
  defaultProps: {
    colorScheme: 'gray',
  },
};

const Select = {
  defaultProps: {
    focusBorderColor: 'yellow.700',
  },
};

const Button = {
  baseStyle: {
    borderRadius: 'lg',
  },
};

const Switch = {
  baseStyle: {},
  defaultProps: {
    colorScheme: '#C5FF0A',
  },
};

const popoverChrome = (props) => ({
  content: {
    bg: props.colorMode === 'dark' ? '#1a1a1a' : 'gray.50',
    color: props.colorMode === 'dark' ? 'white' : 'gray.900',
    borderColor: props.colorMode === 'dark' ? 'black' : 'gray.200',
    zIndex: '1',
  },
  arrow: {
    bg: props.colorMode === 'dark' ? '#1a1a1a' : 'gray.50',
  },
});

// Define the theme
const theme = extendTheme({
  /* Explicit tiers: mobile / large phone / tablet / desktop / wide (PWA + extension scaling). */
  breakpoints: {
    sm: '30em',
    md: '48em',
    lg: '62em',
    xl: '80em',
    '2xl': '96em',
  },
  fontSizes: {
    xs: scaledFont('0.75rem'),
    sm: scaledFont('0.875rem'),
    md: scaledFont('1rem'),
    lg: scaledFont('1.125rem'),
    xl: scaledFont('1.25rem'),
    '2xl': scaledFont('1.5rem'),
    '3xl': scaledFont('1.875rem'),
    '4xl': scaledFont('2.25rem'),
  },
  colors: {
    yellow: {
      100: '#F8FFC7',
      200: '#EDFF8E',
      300: '#E2FF55',
      400: '#D7FF1C',
      500: '#CEFA00',
      600: '#B2D300',
      700: '#97AC00',
      800: '#7C8600',
      900: '#5E6300',
    },
    cyan: {
      100: '#C7FEFF',
      200: '#8EF9FF',
      300: '#55F4FF',
      400: '#1CEFFF',
      500: '#00F5FF',
      600: '#00CED3',
      700: '#00A7AC',
      800: '#008085',
      900: '#005A5E',
    },
    purple: {
      100: '#F8C7FF',
      200: '#F18EFF',
      300: '#EA55FF',
      400: '#E31CFF',
      500: '#DC1BFA',
      600: '#B217D3',
      700: '#8811AC',
      800: '#5E0B85',
      900: '#35055E',
    },
    gray: {
      100: '#CFCFCF',
      200: '#BEBEBE',
      300: '#A9A9A9',
      400: '#8C8C8C',
      500: '#707070',
      600: '#5A5A5A',
      700: '#464646',
      800: '#2F2F2F',
      900: '#2A2A2A',
    },
    customGray: {
      50: '#2F2F2F',
      100: '#2F2F2F',
      200: '#2F2F2F',
      300: '#2F2F2F',
      400: '#2F2F2F',
      500: '#ffffff',
      600: '#ffffff',
      700: '#ffffff',
      800: '#ffffff',
      900: '#ffffff',
    },
    blue: {
      100: '#b4c5d5',
      200: '#a3b7cc',
      300: '#92aac3',
      400: '#819cbc',
      500: '#708fb4',
      600: '#5f81a1',
      700: '#4e738e',
      800: '#3d657a',
      900: '#2c5767',
    },
    orange: {
      100: '#E8AA00',
      200: '#DBA100',
      300: '#D19900',
      400: '#C49000',
      500: '#B08102',
      600: '#997000',
      700: '#856100',
      800: '#6B4F00',
      900: '#6B4F00',
    },
    red: {
      100: '#F2B3B3',
      200: '#E68080',
      300: '#D94D4D',
      400: '#CC1A1A',
      500: '#B80000',
      600: '#A10000',
      700: '#8A0000',
      800: '#730000',
      900: '#5C0000',
    },
    components: {
      components: {
        Tabs: {
          baseStyle: {
            tab: {
              fontWeight: 'bold',
              _selected: {
                bgGradient: 'linear(to-r, cyan.500, purple.500)',
                color: 'white',
              },
              _hover: {
                bgGradient: 'linear(to-r, yellow.400, orange.400)',
                color: 'white',
              },
              _focus: {
                boxShadow: 'none',
              },
              padding: '12px',
              borderRadius: '8px',
            },
          },
        },
      },
    },
  },

  components: {
    Checkbox,
    Input,
    Select,
    Button,
    Switch,
    Popover: {
      baseStyle: popoverChrome,
    },
    PopoverContent: {
      baseStyle: (props) => ({
        bg: props.colorMode === 'dark' ? '#1a1a1a' : 'white',
        borderColor:
          props.colorMode === 'dark'
            ? 'rgba(255, 255, 0, 0.75)'
            : 'rgba(0, 0, 0, 0.12)',
        borderWidth: '2px',
        zIndex: '1',
        color: props.colorMode === 'dark' ? 'white' : 'gray.900',
      }),
    },
    Modal: {
      baseStyle: (props) => ({
        overlay: {
          bg: props.colorMode === 'dark' ? 'blackAlpha.800' : 'blackAlpha.500',
        },
        dialog: {
          bg: props.colorMode === 'dark' ? '#1a1a1a' : 'gray.50',
          color: props.colorMode === 'dark' ? 'white' : 'gray.900',
        },
      }),
    },
    Menu: {
      baseStyle: (props) => {
        const listBg = props.colorMode === 'dark' ? '#1a1a1a' : 'white';
        const rowHover = props.colorMode === 'dark' ? 'black' : 'gray.100';
        return {
          list: {
            bg: listBg,
            borderWidth: props.colorMode === 'light' ? '1px' : undefined,
            borderColor: props.colorMode === 'light' ? 'gray.200' : undefined,
          },
          item: {
            bg: listBg,
            color: props.colorMode === 'dark' ? 'white' : 'gray.900',
            _hover: { bg: rowHover },
            _focus: { bg: rowHover },
            _active: { bg: rowHover },
          },
        };
      },
    },
  },

  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },

  styles: {
    global: (props) => ({
      html: {
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%',
      },
      body: {
        overflow: 'hidden',
        bg: props.colorMode === 'dark' ? '#080808' : '#eef1f6',
        color: props.colorMode === 'dark' ? 'gray.100' : 'gray.800',
        fontSize: 'md',
      },
    }),
  },

  fonts: {
    body: 'sans-serif',
  },
});

// Wrap the ChakraProvider with the custom theme
const Theme = ({ children }) => (
  <ChakraProvider theme={theme} colorModeManager={lucemChakraColorModeManager}>
    <AppearancePreferenceProvider>{children}</AppearancePreferenceProvider>
  </ChakraProvider>
);

export default Theme;
