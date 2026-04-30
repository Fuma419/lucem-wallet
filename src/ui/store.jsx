import React from 'react';
import {
  getCurrency,
  getNetwork,
  requestAccountKey,
  setCurrency,
  setNetwork,
} from '../api/extension';
import { NETWORK_ID, NODE } from '../config/config';
import {
  createStore,
  action,
  useStore,
  useStoreActions,
  StoreProvider,
  useStoreState,
  persist,
} from 'easy-peasy';
import { Box, Text, Spinner } from '@chakra-ui/react';
import { InfoOutlineIcon } from '@chakra-ui/icons';
import {
  needUpgrade,
  needPWD,
  migrate,
  setPWD,
  isUpgrade,
} from '../migrations/migration';
import ConfirmModal from './app/components/confirmModal';
import { UpgradeModal } from './app/components/UpgradeModal';
import { sendStore } from './app/pages/send';

const settings = {
  settings: null,
  setSettings: action((state, settings) => {
    setCurrency(settings.currency);
    setNetwork(settings.network);
    state.settings = {
      ...settings,
      adaSymbol:
        settings.network.id === NETWORK_ID.mainnet
          ? '₳'
          : settings.network.id === NETWORK_ID.midnight_preview
            ? '—'
            : 't₳',
    };
  }),
};

const routeStore = {
  route: null,
  setRoute: action((state, route) => {
    state.route = route;
  }),
};

const globalModel = persist(
  {
    routeStore,
    sendStore,
  },
  { storage: 'localStorage' }
);

const initSettings = async (setSettings) => {
  const currency = await getCurrency();
  const network = await getNetwork();
  setSettings({
    currency: currency || 'usd',
    network: network || { id: NETWORK_ID.mainnet, node: NODE.mainnet },
    adaSymbol: network
      ? network.id === NETWORK_ID.mainnet
        ? '₳'
        : network.id === NETWORK_ID.midnight_preview
          ? '—'
          : 't₳'
      : '₳',
  });
};

// create the global store object
const store = createStore({
  globalModel,
  settings,
});

// sets the initial store state
const initStore = async (state, actions) => {
  await initSettings(actions.settings.setSettings);
};

// Store component that loads the store and calls initStore
const StoreInit = ({ children }) => {
  const store = useStore();
  const actions = useStoreActions((actions) => actions);
  const state = useStoreState((state) => state);
  const settings = state.settings.settings;
  const [isLoading, setIsLoading] = React.useState(true);
  /** easy-peasy's useStoreRehydrated only flips true on .then(); if rehydration rejects, the app hung forever. */
  const [persistReady, setPersistReady] = React.useState(false);
  const [info, setInfo] = React.useState(null);
  const [password, setPassword] = React.useState(false);
  const refA = React.useRef();
  const refB = React.useRef();

  React.useEffect(() => {
    store.persist
      .resolveRehydration()
      .catch((err) => {
        console.error('Easy-peasy persist rehydration failed:', err);
      })
      .finally(() => setPersistReady(true));
  }, [store]);

  const init = async () => {
    try {
      if (await needUpgrade()) {
        await upgrade();
      } else {
        await initStore(state, actions);
        setIsLoading(false);
        if (info && info.length) {
          refB.current.openModal();
        }
      }
    } catch (e) {
      console.error('Wallet bootstrap failed:', e);
      try {
        await initStore(state, actions);
      } catch (_) {
        /* ignore */
      }
      setIsLoading(false);
    }
  };

  const upgrade = async () => {
    let pwdReq = await needPWD();
    if (pwdReq) {
      refA.current.openModal();
      return;
    }
    let isUp = await isUpgrade();
    let info = await migrate();
    setInfo(isUp ? info : false);
  };

  React.useEffect(() => {
    init();
  }, [password, info]);
  return (
    <>
      {isLoading || !persistReady ? (
        <>
          <Box
            minH="100vh"
            sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
            width="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Spinner color="yellow" speed="0.5s" />
          </Box>

          <ConfirmModal
            ref={refA}
            title="Update requires password"
            sign={async (pwd) => {
              await requestAccountKey(pwd, 0);
              setPWD(pwd);
            }}
            onConfirm={async (status) => {
              if (status === true) {
                setPassword(true);
                refA.current.closeModal();
              }
            }}
            onCloseBtn={() => {
              window.close();
            }}
          />
        </>
      ) : (
        <>
          {children}
          {info && info.length ? <UpgradeModal info={info} ref={refB} /> : ''}
          {/* Settings Overlay */}
        </>
      )}
    </>
  );
};

// wrapping the StoreInit component inside the actual StoreProvider in order to initialize the store state
export default ({ children }) => {
  return (
    <StoreProvider store={store}>
      <StoreInit>{children}</StoreInit>
    </StoreProvider>
  );
};
