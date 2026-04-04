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
import { hasStoredAccounts } from '../api/extension';
import Settings from './app/pages/settings';
import Send from './app/pages/send';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { TermsAndPrivacyProvider } from '../features/terms-and-privacy';

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
    if (hasWallet) {
      navigate('/wallet');
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
    } else {
      navigate('/welcome');
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
    <div style={{ overflowX: 'hidden' }}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/settings/*" element={<Settings />} />
        <Route path="/send" element={<Send />} />
        <Route
          path="*"
          element={
            <TermsAndPrivacyProvider>
              <Wallet />
            </TermsAndPrivacyProvider>
          }
        />
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

if (module.hot) module.hot.accept();
