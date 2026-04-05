import React from 'react';
import { TAB } from '../../../config/config';
import Main from '../../index';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import {
  Box,
  Flex,
  Image,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';

// assets
import LogoOriginal from '../../../assets/img/logo.svg';
import LogoWhite from '../../../assets/img/bannerBlack.png';
import {
  closeCurrentTab,
  getCurrentAccount,
  indexToHw,
  initHW,
} from '../../../api/extension';
import { signAndSubmitHW } from '../../../api/extension/wallet';
import Loader from '../../../api/loader';
import { useStoreActions } from 'easy-peasy';

const App = () => {
  const Logo = useColorModeValue(LogoOriginal, LogoWhite);
  const backgroundColor = useColorModeValue('gray.200', 'inherit');
  const toast = useToast();

  const setRoute = useStoreActions(
    (actions) => actions.globalModel.routeStore.setRoute
  );
  const resetSend = useStoreActions(
    (actions) => actions.globalModel.sendStore.reset
  );

  const init = async () => {
    await Loader.load();

    const account = await getCurrentAccount();
    const params = new URLSearchParams(window.location.search);
    const tx = params.get('tx');
    const hw = indexToHw(account.index);

    const txDes = Loader.Cardano.Transaction.from_cbor_bytes(Buffer.from(tx, 'hex'));
    await initHW({ device: hw.device, id: hw.id });
    try {
      await signAndSubmitHW(txDes, {
        keyHashes: [account.paymentKeyHash],
        account,
        hw,
      });
      toast({
        title: 'Transaction submitted',
        status: 'success',
        duration: 3000,
      });
    } catch (_e) {
      toast({
        title: 'Transaction failed',
        status: 'error',
        duration: 3000,
      });
    }
    resetSend();
    setRoute('/wallet');
    setTimeout(() => closeCurrentTab(), 3000);
  };

  React.useEffect(() => init(), []);

  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      w="full"
      background={backgroundColor}
      className="lucem-wallet-main-column"
    >
      <Box
        flexShrink={0}
        px={4}
        pt={{
          base: 'max(1rem, env(safe-area-inset-top, 0px))',
          md: 10,
        }}
      >
        <Image draggable={false} src={Logo} w="36px" h="auto" alt="" />
      </Box>
      <Flex
        flex="1"
        align="center"
        justify="center"
        px={4}
        pb="calc(1.5rem + env(safe-area-inset-bottom, 0px))"
      >
        <Text fontSize="lg">Waiting for Trezor...</Text>
      </Flex>
    </Box>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.trezorTx}`));
root.render(
    <Main>
      <Router>
        <App />
      </Router>
    </Main>
);

if (module.hot) module.hot.accept();
