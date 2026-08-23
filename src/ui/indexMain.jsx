/**
 * indexMain is the entry point for the extension panel you open at the top right in the browser
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { POPUP } from '../config/config';
import Main from './index';
import { Box, Spinner } from '@chakra-ui/react';
import Welcome from './app/pages/welcome';
import Wallet from './app/pages/wallet';
import Accounts from './app/pages/accounts';
import { hasStoredAccounts } from '../api/extension';
import Settings from './app/pages/settings';
import Send from './app/pages/send';
import Governance from './app/pages/governance';
import Staking from './app/pages/staking';
import WalletShell from './app/components/walletShell';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { TermsAndPrivacyProvider } from '../features/terms-and-privacy';
import PreventHistoryBack from './app/components/PreventHistoryBack';
import { initNativeShell } from '../platform/capacitor';

/**
 * OS / browser back gestures (e.g. iOS swipe-back) restore a prior history entry such as
 * `/wallet` even when storage was cleared or `replace` was used elsewhere. Re-verify before
 * rendering the wallet shell.
 */
function WalletEntryGate({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [allowed, setAllowed] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setAllowed(null);
    hasStoredAccounts().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        navigate('/welcome', { replace: true });
        setAllowed(false);
      } else {
        setAllowed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.key, navigate]);

  React.useEffect(() => {
    const onPageShow = (e) => {
      if (!e.persisted) return;
      hasStoredAccounts().then((ok) => {
        if (!ok) navigate('/welcome', { replace: true });
      });
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [navigate]);

  if (allowed !== true) {
    return (
      <Box
        minH="40vh"
        width="full"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner color="yellow" speed="0.65s" />
      </Box>
    );
  }
  return children;
}

/** Do not replay these after login — they override /wallet and send users to onboarding or shell URLs. */
function shouldReplayPersistedRoute(route) {
  if (!route || route === '/wallet') return false;
  if (route === '/welcome' || route === '/') return false;
  if (/\.html$/i.test(route)) return false;
  return true;
}

const App = () => {
  const route = useStoreState((state) => state.globalModel.routeStore.route);
  const setRoute = useStoreActions(
    (actions) => actions.globalModel.routeStore.setRoute
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = React.useState(true);
  const init = async () => {
    const hasWallet = await hasStoredAccounts();
    // Full-page flows (import/create) may return via `?next=/accounts` (extension)
    // or a path deep-link like `/accounts` (web). Honor that before the default
    // /wallet bootstrap so Cancel from import lands where the user expects.
    const nextParam = new URLSearchParams(window.location.search).get('next');
    const pathNow = location.pathname;
    const allowedDeep = [
      '/accounts',
      '/welcome',
      '/wallet',
      '/settings',
      '/staking',
      '/governance',
      '/send',
    ];
    const deepLink = allowedDeep.includes(nextParam)
      ? nextParam
      : allowedDeep.includes(pathNow)
        ? pathNow
        : null;

    if (!hasWallet) {
      navigate('/welcome', { replace: true });
      setRoute('/welcome');
    } else if (deepLink && deepLink !== '/welcome') {
      navigate(deepLink, { replace: true });
      setRoute(deepLink);
      if (nextParam && typeof window !== 'undefined' && window.history?.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('next');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } else {
      navigate('/wallet', { replace: true });
      if (shouldReplayPersistedRoute(route)) {
        route
          .slice(1)
          .split('/')
          .reduce((acc, r) => {
            const fullRoute = acc + `/${r}`;
            navigate(fullRoute);
            return fullRoute;
          }, '');
      } else {
        setRoute('/wallet');
      }
    }
    setIsLoading(false);
  };

  React.useEffect(() => {
    init();
  }, []);

  React.useEffect(() => {
    if (!isLoading) {
      setRoute(location.pathname);
    }
  }, [location, isLoading, setRoute]);

  return isLoading ? (
    <Box
      height="full"
      width="full"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Spinner color="yellow" speed="0.5s" />
    </Box>
  ) : (
    <div style={{ overflowX: 'hidden', height: '100%' }}>
      <PreventHistoryBack />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/send" element={<Send />} />
        <Route
          element={
            <WalletEntryGate>
              <TermsAndPrivacyProvider>
                <WalletShell />
              </TermsAndPrivacyProvider>
            </WalletEntryGate>
          }
        >
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="*" element={<Wallet />} />
        </Route>
      </Routes>
    </div>
  );
};

const root = createRoot(window.document.querySelector(`#${POPUP.main}`));
root.render(
    <Main>
      <Router>
        <App />
      </Router>
    </Main>
);

// Configure the native (Capacitor) shell when running as an iOS/Android app;
// no-op in the browser extension and web builds.
initNativeShell();

if (module.hot) module.hot.accept();
