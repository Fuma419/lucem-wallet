import React from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { POPUP_WINDOW } from '../config/config';
import './app/components/styles.css';
import 'focus-visible/dist/focus-visible';

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
  baseStyle: {  
  },
  defaultProps: {
    colorScheme: '#C5FF0A',
  },
};

// Define the theme
const theme = extendTheme({
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
  },

  components: {
    Checkbox,
    Input,
    Select,
    Button,
    Switch,
    // Menu: {
    //   baseStyle: {
    //     list: {
    //       bg: 'black', // Force the background of the MenuList to be black
    //       boxShadow: '0 0 40px 6px rgba(255, 255, 0, 0.75)',
    //     },
    //   },
    // },
    // MenuList: {
    //   baseStyle: {
    //     bg: 'yellow', // Default background
    //     boxShadow: '0 0 40px 6px rgba(255, 255, 0, 0.75)',
    //   },
    // },
    // MenuGroup: {
    //   baseStyle: {
    //     bg: 'yellow', // Default background
    //     boxShadow: '0 0 40px 6px rgba(255, 255, 0, 0.75)',
    //   },
    // },
    // MenuItem: {
    //   baseStyle: {
    //     bg: 'yellow', // Default background
    //     boxShadow: '0 0 40px 6px rgba(255, 255, 0, 0.75)',
    //   },
    // // },
    // Modal: {
    //   baseStyle: {
    //     dialog: {
    //       background: 'black',
    //       boxShadow: '0 0 40px 6px rgba(255, 255, 0, 0.75)',
    //     },
    //   },
    // },
  },

  config: {
    initialColorMode: 'dark', // Force dark mode
    useSystemColorMode: false, // Disable system color mode preference
  },

  styles: {
    global: {
      body: {
        overflow: 'hidden',
        bg: '#080808', // Ensure the background is dark
        color: 'gray.100', // Ensure text is light-colored
      },
    },
  },

  fonts: {
    body: 'sans-serif',
  },
});

// Wrap the ChakraProvider with the custom theme
const Theme = ({ children }) => {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
};

export default Theme;
