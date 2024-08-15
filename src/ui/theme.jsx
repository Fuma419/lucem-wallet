import React from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { POPUP_WINDOW } from '../config/config';
import './app/components/styles.css';
import 'focus-visible/dist/focus-visible';

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
    focusBorderColor: 'gray.300',
  },
};

const Checkbox = {
  defaultProps: {
    colorScheme: 'yellow',
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
      100: "#F8FFC7", // Lightest shade, very pale yellow-green
      200: "#EDFF8E", // Light yellow-green
      300: "#E2FF55", // Light green-yellow
      400: "#D7FF1C", // Slightly lighter than base
      500: "#CEFA00", // Base color
      600: "#B2D300", // Slightly darker than base
      700: "#97AC00", // Darker shade
      800: "#7C8600", // Even darker
      900: "#5E6300", // Darkest shade
    },
    cyan: { 
      100: "#C7FEFF", // Lightest shade, very pale cyan
      200: "#8EF9FF", // Light cyan
      300: "#55F4FF", // Light blue-cyan
      400: "#1CEFFF", // Slightly lighter than base
      500: "#00F5FF", // Base color
      600: "#00CED3", // Slightly darker than base
      700: "#00A7AC", // Darker shade
      800: "#008085", // Even darker
      900: "#005A5E", // Darkest shade
    },
    purple: { 
      100: "#F8C7FF", // Lightest shade, very pale purple
      200: "#F18EFF", // Light purple
      300: "#EA55FF", // Light pink-purple
      400: "#E31CFF", // Slightly lighter than base
      500: "#DC1BFA", // Base color
      600: "#B217D3", // Slightly darker than base
      700: "#8811AC", // Darker shade
      800: "#5E0B85", // Even darker
      900: "#35055E", // Darkest shade
    },    
    gray: { 
      100: "#CFCFCF", // Darker light gray
      200: "#BEBEBE", // Darker light gray
      300: "#A9A9A9", // Darker medium gray
      400: "#8C8C8C", // Darker gray
      500: "#707070", // Dark gray
      600: "#5A5A5A", // Darker gray
      700: "#464646", // Even darker gray
      800: "#2F2F2F", // Much darker gray
      900: "#2A2A2A", // Darkest gray
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
    initialColorMode: 'dark', // Force dark mode
    useSystemColorMode: false, // Disable system color mode preference
  },
  styles: {
    global: {
      body: {
        // width: POPUP_WINDOW.width + 'px',
        // height: POPUP_WINDOW.height + 'px',
        overflow: 'hidden',
        bg: '#1B1C1E', // Ensure the background is dark
        color: 'gray.100', // Ensure text is light-colored
      },
    },
  },
  fonts: {
    body: 'sans-serif', // Updated font
  },
});

const Theme = ({ children }) => {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
};

export default Theme;
