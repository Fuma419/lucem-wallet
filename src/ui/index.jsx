import React from 'react';
import { POPUP, POPUP_WINDOW } from '../config/config';
import {
  Scrollbars,
  lucemTransparentScrollView,
} from './app/components/scrollbar';
import './app/components/styles.css';
import Theme from './theme';
import StoreProvider from './store';
import { Box, IconButton } from '@chakra-ui/react';
import { ChevronUpIcon } from '@chakra-ui/icons';
import {
  detectIsExtensionPopup,
  detectIsFullBleedWalletTab,
  LUCEM_LAYOUT,
} from './layout/surface';
import {
  LayoutSurfaceProvider,
  useLayoutSurface,
} from './layout/LayoutSurfaceProvider';

/** Main wallet popup (`mainPopup.html`) */
const isMainPopup = window.document.querySelector(`#${POPUP.main}`);
/** Full-page wallet HTML entries (not the 400px popup) — use full width; no gray scroll panel. */
const isFullBleedWalletTab = detectIsFullBleedWalletTab(window.document);
const isExtensionPopup = detectIsExtensionPopup(
  window.document,
  typeof chrome !== 'undefined' ? chrome : undefined
);

const MainFrame = ({ children }) => {
  const surface = useLayoutSurface();
  const [scroll, setScroll] = React.useState({ el: null, y: 0 });
  const isPhoneColumn =
    surface === LUCEM_LAYOUT.touch && !isFullBleedWalletTab;

  React.useEffect(() => {
    window.document.body.addEventListener(
      'keydown',
      (e) => e.key === 'Escape' && e.preventDefault()
    );
    if (
      navigator.userAgent.indexOf('Win') != -1 &&
      !isMainPopup &&
      !isFullBleedWalletTab
    ) {
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
      maxW={isPhoneColumn ? '480px' : undefined}
      minW={0}
      mx={isPhoneColumn ? 'auto' : undefined}
      bg="transparent"
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
            renderView={lucemTransparentScrollView}
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

const Main = ({ children }) => (
  <LayoutSurfaceProvider>
    <MainFrame>{children}</MainFrame>
  </LayoutSurfaceProvider>
);

export default Main;
