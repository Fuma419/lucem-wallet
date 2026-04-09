import React from 'react';
import '../components/styles.css';
import { TAB } from '../../../config/config';
import Main from '../../index';
import PreventHistoryBack from '../components/PreventHistoryBack';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { Box, Flex, Image, Text, useToast } from '@chakra-ui/react';

import LogoWhite from '../../../assets/img/bannerBlack.png';
import backgroundGreenWebp from '../../../assets/img/background-green.webp';
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

    const txDes = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
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
      className="lucem-wallet-main-column"
      backgroundColor="#050f18"
      backgroundImage={`linear-gradient(165deg, rgba(12, 28, 10, 0.9) 0%, rgba(8, 38, 18, 0.84) 45%, rgba(6, 22, 12, 0.92) 100%), url(${backgroundGreenWebp})`}
      backgroundSize="cover, cover"
      backgroundPosition="center, center"
      backgroundRepeat="no-repeat, no-repeat"
    >
      <Box
        flexShrink={0}
        px={{ base: 4, md: 8 }}
        pt={{
          base: 'max(1rem, env(safe-area-inset-top, 0px))',
          md: 8,
        }}
        pb={2}
      >
        <Image
          draggable={false}
          src={LogoWhite}
          width={{ base: '72px', sm: '88px', md: '100px' }}
          maxW="min(100px, 36vw)"
          objectFit="contain"
          alt=""
        />
      </Box>
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
          background="rgba(0, 0, 0, 0.85)"
          color="whiteAlpha.900"
          maxW="420px"
          mx="auto"
        >
          <Text className="walletTitle" fontSize="lg" fontWeight="bold" textAlign="center">
            Waiting for Trezor…
          </Text>
          <Text fontSize="sm" color="whiteAlpha.700" textAlign="center" mt={3}>
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
