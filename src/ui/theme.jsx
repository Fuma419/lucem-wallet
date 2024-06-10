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
    focusBorderColor: 'yellow.600',
  },
};

const Checkbox = {
  defaultProps: {
    colorScheme: '#C5FF0A',
  },
};

const Select = {
  defaultProps: {
    focusBorderColor: 'yellow.600',
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
    colorScheme: '#C5FF0A',
  },
};

const theme = extendTheme({
  colors: {
    yellow: { 
      100: "#F2FFB3", // Lightest shade, very pale yellow-green
      200: "#E8FF80", // Light yellow-green
      300: "#DEFF4D", // Light green-yellow
      400: "#D4FF1A", // Close to base, slightly lighter
      500: "#C5FF0A", // Base color
      600: "#ADDC09", // Slightly darker than base
      700: "#94B507", // Darker shade
      800: "#7A8E05", // Even darker
      900: "#566004", // Darkest shade
    },    
    gray: { 
      100: "#E1E1E1", // Light gray
      200: "#CFCFCF", // Light gray
      300: "#BEBEBE", // Light gray
      400: "#A9A9A9", // Medium gray
      500: "#8C8C8C", // Gray
      600: "#787878", // Dark gray
      700: "#616161", // Darker gray
      800: "#4D4D4D", // Even darker gray
      900: "#383838", // Darkest gray
    },
    blue: {
      100: "#b4c5d5", // Light blue
      200: "#a3b7cc", // Lighter blue
      300: "#92aac3", // Light blue
      400: "#819cbc", // Light blue
      500: "#708fb4", // Base blue
      600: "#5f81a1", // Slightly darker blue
      700: "#4e738e", // Darker blue
      800: "#3d657a", // Even darker blue
      900: "#2c5767", // Darkest blue
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
    red: { 
      100: "#F2B3B3", // Very light red
      200: "#E68080", // Light red
      300: "#D94D4D", // Red
      400: "#CC1A1A", // Strong red
      500: "#B80000", // Base red
      600: "#A10000", // Dark red
      700: "#8A0000", // Darker red
      800: "#730000", // Even darker red
      900: "#5C0000", // Darkest red
    }
  },

  components: {
    Checkbox,
    Input,
    Select,
    Button,
    Switch,
  },
  config: {
    useSystemColorMode: colorMode ? true : false,
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
