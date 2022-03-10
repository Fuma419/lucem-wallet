import React from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { POPUP_WINDOW } from '../config/config';
import './app/components/styles.css';
import '@fontsource/ubuntu/latin.css';
import 'focus-visible/dist/focus-visible';

const colorMode = localStorage['chakra-ui-color-mode'];

const inputSizes = {
  sm: {
    borderRadius: 'lg',
  },
  md: {
    borderRadius: 'lg',
  },
};

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
    focusBorderColor: 'yellow.500',
  },
};

const Checkbox = {
  defaultProps: {
    colorScheme: 'yellow',
  },
};

const Select = {
  defaultProps: {
    focusBorderColor: 'yellow.500',
  },
};

const Button = {
  baseStyle: {
    borderRadius: 'lg',
  },
};

const Switch = {
  baseStyle: {
    track: {
      _focus: {
        boxShadow: 'none',
      },
    },
  },
  defaultProps: {
    colorScheme: 'yellow',
  },
};

const theme = extendTheme({
  colors: {
    yellow: { 
      100: "#E1EDAD",
      200: "#DBF07F",
      300: "#D8F261",
      400: "#D2F538",
      500: "#CCFA00",
      600: "#B1D900",
      700: "#94B500",
      800: "#758F00",
      900: "#4F6100",
    },
    teal: { 
      100: "#E1EDAD",
      200: "#DBF07F",
      300: "#D8F261",
      400: "#D2F538",
      500: "#CCFA00",
      600: "#B1D900",
      700: "#94B500",
      800: "#758F00",
      900: "#4F6100",
    },
    gray: { 
      100: "#CCCCCC",
      200: "#BABAB8",
      300: "#B3B3B3",
      400: "#A1A1A1",
      500: "#383838",
      600: "#787877",
      700: "#1B1C1E",
      800: "#1B1C1E",
      900: "#1B1C1E",
    },
    orange: { 
      100: "#E8AA00",
      200: "#DBA100",
      300: "#D19900",
      400: "#C49000",
      500: "#B08102",
      600: "#997000",
      700: "#856100",
      800: "#6B4F00",
      900: "#6B4F00",
    },
  },

  components: {
    Checkbox,
    Input,
    Select,
    Button,
    Switch,
  },
  config: {
    useSystemColorMode: colorMode ? false : true,
  },
  styles: {
    global: {
      body: {
        // width: POPUP_WINDOW.width + 'px',
        // height: POPUP_WINDOW.height + 'px',
        overflow: 'hidden',
      },
    },
  },
  fonts: {
    body: 'Ubuntu, sans-serif',
  },
});

const Theme = ({ children }) => {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
};

export default Theme;
