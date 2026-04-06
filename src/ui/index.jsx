import React from 'react';
import { POPUP, POPUP_WINDOW, TAB } from '../config/config';
import { Scrollbars } from './app/components/scrollbar';
import './app/components/styles.css';
import Theme from './theme';
import StoreProvider from './store';
import { Box, IconButton } from '@chakra-ui/react';
import { ChevronUpIcon } from '@chakra-ui/icons';

/** Main wallet popup (`mainPopup.html`) */
const isMainPopup = window.document.querySelector(`#${POPUP.main}`);
/** dApp approval popup (`internalPopup.html`); must use POPUP_WINDOW like main */
const isInternalPopup = window.document.querySelector(`#${POPUP.internal}`);
const isTab = window.document.querySelector(`#${TAB.hw}`);
const isExtensionPopup =
  (isMainPopup || isInternalPopup) &&
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime !== 'undefined' &&
  typeof chrome.runtime.id !== 'undefined';

const Main = ({ children }) => {
  const [scroll, setScroll] = React.useState({ el: null, y: 0 });

  React.useEffect(() => {
    window.document.body.addEventListener(
      'keydown',
      (e) => e.key === 'Escape' && e.preventDefault()
    );
    if (navigator.userAgent.indexOf('Win') != -1 && !isMainPopup && !isTab) {
      const width =
        POPUP_WINDOW.width + (window.outerWidth - window.innerWidth);
      const height =
        POPUP_WINDOW.height + (window.outerHeight - window.innerHeight);
      window.resizeTo(width, height);
    }
  }, []);
  return (
    <Box
      width={isExtensionPopup ? POPUP_WINDOW.width + 'px' : '100%'}
      height={isExtensionPopup ? POPUP_WINDOW.height + 'px' : '100vh'}
      maxW={isExtensionPopup ? undefined : '480px'}
      minW={0}
      mx={isExtensionPopup ? undefined : 'auto'}
      bg="#080808"
      sx={
        !isExtensionPopup
          ? {
              '@supports (height: 100dvh)': {
                height: '100dvh',
                maxHeight: '100dvh',
              },
            }
          : undefined
      }
    >
      <Theme>
        <StoreProvider>
          <Scrollbars
            id="scroll"
            style={
              isExtensionPopup
                ? { width: '100vw', height: '100vh' }
                : { width: '100%', height: '100%' }
            }
            autoHide
            onScroll={(e) => {
              setScroll({ el: e.target, y: e.target.scrollTop });
            }}
          >
            {children}
            {scroll.y > 1200 && (
              <IconButton
                onClick={() => {
                  scroll.el.scrollTo({ behavior: 'smooth', top: 0 });
                }}
                position="fixed"
                bottom={
                  isExtensionPopup
                    ? '15px'
                    : 'calc(15px + env(safe-area-inset-bottom, 0px))'
                }
                right={
                  isExtensionPopup
                    ? '15px'
                    : 'calc(15px + env(safe-area-inset-right, 0px))'
                }
                size="sm"
                rounded="xl"
                colorScheme="yellow"
                opacity={0.85}
                icon={<ChevronUpIcon />}
              ></IconButton>
            )}
          </Scrollbars>
        </StoreProvider>
      </Theme>
    </Box>
  );
};

export default Main;
