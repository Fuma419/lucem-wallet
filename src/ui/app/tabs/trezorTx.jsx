import React from 'react';
import '../components/styles.css';
import { TAB } from '../../../config/config';
import Main from '../../index';
import PreventHistoryBack from '../components/PreventHistoryBack';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { Box, Flex, Text, useToast } from '@chakra-ui/react';

import LogoWhite from '../../../assets/img/bannerBlack.png';
import backgroundGreenWebp from '../../../assets/img/background-green.webp';
import {
  FlowCardCloseButton,
  FlowShellHeader,
  leaveSignTabFlow,
  readFlowReturnPath,
} from '../components/flowExit';
import {
  closeCurrentTab,
  getCurrentAccount,
  indexToHw,
  initHW,
  paymentKeyHashesForSigning,
} from '../../../api/extension';
import { signAndSubmitHW } from '../../../api/extension/wallet';
import Loader from '../../../api/loader';
import { useStoreActions } from 'easy-peasy';

const App = () => {
  const toast = useToast();
  const abandonedRef = React.useRef(false);

  const setRoute = useStoreActions(
    (actions) => actions.globalModel.routeStore.setRoute
  );
  const resetSend = useStoreActions(
    (actions) => actions.globalModel.sendStore.reset
  );

  const abandon = React.useCallback(async () => {
    abandonedRef.current = true;
    const dest = readFlowReturnPath() || '/wallet';
    try {
      resetSend();
      setRoute(dest);
    } catch {
      /* still leave */
    }
    await leaveSignTabFlow(dest);
  }, [resetSend, setRoute]);

  const init = async () => {
    await Loader.load();

    const account = await getCurrentAccount();
    const params = new URLSearchParams(window.location.search);
    const tx = params.get('tx');
    const hw = indexToHw(account.index);

    const txDes = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
    await initHW({ device: hw.device, id: hw.id });
    try {
      if (abandonedRef.current) return;
      const paymentHashes = await paymentKeyHashesForSigning(account);
      await signAndSubmitHW(txDes, {
        keyHashes: paymentHashes.length
          ? paymentHashes
          : [account.paymentKeyHash].filter(Boolean),
        account,
        hw,
      });
      if (abandonedRef.current) return;
      toast({
        title: 'Transaction submitted',
        status: 'success',
        duration: 3000,
      });
    } catch (_e) {
      if (abandonedRef.current) return;
      toast({
        title: 'Transaction failed',
        status: 'error',
        duration: 3000,
      });
    }
    if (abandonedRef.current) return;
    resetSend();
    setRoute(readFlowReturnPath() || '/wallet');
    setTimeout(() => closeCurrentTab(), 3000);
  };

  React.useEffect(() => {
    init();
  }, []);

  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      w="full"
      className="lucem-wallet-main-column"
      backgroundColor="#050f18"
      backgroundImage={`linear-gradient(165deg, rgba(12, 28, 10, 0.9) 0%, rgba(8, 38, 18, 0.84) 45%, rgba(6, 22, 12, 0.92) 100%), url(${backgroundGreenWebp})`}
      backgroundSize="cover, cover"
      backgroundPosition="center, center"
      backgroundRepeat="no-repeat, no-repeat"
    >
      <FlowShellHeader logoSrc={LogoWhite} />
      <Flex
        flex="1"
        align="center"
        justify="center"
        px={4}
        pb="calc(1.5rem + env(safe-area-inset-bottom, 0px))"
      >
        <Box
          className="modal-glow-yellow-green lucem-modal-card"
          rounded="2xl"
          px={8}
          py={10}
          pt={12}
          background="rgba(0, 0, 0, 0.85)"
          color="whiteAlpha.900"
          maxW="420px"
          mx="auto"
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={4}
          position="relative"
        >
          <FlowCardCloseButton onClick={abandon} />
          <Text className="walletTitle" fontSize="lg" fontWeight="bold" textAlign="center">
            Waiting for Trezor…
          </Text>
          <Text fontSize="sm" color="whiteAlpha.700" textAlign="center" mt={1}>
            Complete signing on your device. This tab will close when the transaction is
            submitted.
          </Text>
        </Box>
      </Flex>
    </Box>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.trezorTx}`));
root.render(
    <Main>
      <Router>
        <>
          <PreventHistoryBack />
          <App />
        </>
      </Router>
    </Main>
);

if (module.hot) module.hot.accept();
