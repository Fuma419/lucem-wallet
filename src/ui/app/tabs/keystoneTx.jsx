/**
 * Full-page tab: show Cardano sign QR for Keystone, then scan signature QR.
 */

import React from 'react';
import { TAB } from '../../../config/config';
import Main from '../../index';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import {
  Box,
  Button,
  Flex,
  Image,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { AnimatedQRCode, AnimatedQRScanner } from '@keystonehq/animated-qr';
import { URType } from '@keystonehq/keystone-sdk';
import LogoOriginal from '../../../assets/img/logo.svg';
import LogoWhite from '../../../assets/img/bannerBlack.png';
import {
  closeCurrentTab,
  getCurrentAccount,
  getUtxos,
  indexToHw,
  submitTx,
  takeKeystoneSignPayload,
} from '../../../api/extension';
import Loader from '../../../api/loader';
import { useStoreActions } from 'easy-peasy';
import {
  buildKeystoneCardanoSignRequest,
  KEYSTONE_SIGN_ANIMATED_QR_OPTIONS,
  parseKeystoneCardanoTxSignature,
  witnessSetHexFromKeystoneSignature,
} from '../../../api/keystone-cardano';
import KeystoneSDK from '@keystonehq/keystone-sdk';

const Phase = {
  load: 'load',
  showQr: 'showQr',
  scan: 'scan',
  done: 'done',
};

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

  const [phase, setPhase] = React.useState(Phase.load);
  const [error, setError] = React.useState('');
  const [urData, setUrData] = React.useState({ type: '', cbor: '' });
  const pendingTxHexRef = React.useRef('');
  const sdkRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Loader.load();
        const params = new URLSearchParams(window.location.search);
        const signId = params.get('signId');
        if (!signId) {
          setError('Missing sign session. Close this tab and try again.');
          setPhase(Phase.done);
          return;
        }
        const pending = await takeKeystoneSignPayload(signId);
        if (!pending || cancelled) {
          if (!cancelled) {
            setError('Sign session expired or already used.');
            setPhase(Phase.done);
          }
          return;
        }

        pendingTxHexRef.current = pending.txHex;
        const account = await getCurrentAccount();
        const hw = indexToHw(account.index);
        const utxos = await getUtxos();
        const { ur, sdk } = await buildKeystoneCardanoSignRequest({
          txHex: pending.txHex,
          account,
          hw,
          utxos,
          keyHashes: pending.keyHashes,
        });
        if (cancelled) return;
        sdkRef.current = sdk;
        setUrData({
          type: ur.type,
          cbor: Buffer.from(ur.cbor).toString('hex'),
        });
        setPhase(Phase.showQr);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not prepare Keystone sign request.');
          setPhase(Phase.done);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalizeWitness = async (witnessHex) => {
    try {
      await Loader.load();
      const txHex = pendingTxHexRef.current;
      if (!txHex) {
        throw new Error('Sign session missing. Restart from the wallet.');
      }
      const rawTx = Loader.Cardano.Transaction.from_cbor_bytes(
        Buffer.from(txHex, 'hex')
      );
      const witnessSet = Loader.Cardano.TransactionWitnessSet.from_bytes(
        Buffer.from(witnessHex, 'hex')
      );
      const signed = Loader.Cardano.Transaction.new(
        rawTx.body(),
        witnessSet,
        true,
        rawTx.auxiliary_data()
      );
      await submitTx(Buffer.from(signed.to_bytes(), 'hex').toString('hex'));
      toast({
        title: 'Transaction submitted',
        status: 'success',
        duration: 3000,
      });
    } catch (e) {
      toast({
        title: 'Transaction failed',
        description: e.message,
        status: 'error',
        duration: 5000,
      });
      throw e;
    } finally {
      resetSend();
      setRoute('/wallet');
      setTimeout(() => closeCurrentTab(), 2500);
    }
  };

  const onSignatureScan = async ({ type, cbor }) => {
    try {
      const sdk = sdkRef.current || new KeystoneSDK();
      const sig = parseKeystoneCardanoTxSignature(sdk, { type, cbor });
      const wh = witnessSetHexFromKeystoneSignature(sig);
      if (!wh) throw new Error('Keystone did not return a witness set.');
      setPhase(Phase.done);
      await finalizeWitness(wh);
    } catch (e) {
      setError(e.message || 'Invalid signature QR');
    }
  };

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
        direction="column"
        align="center"
        justify="flex-start"
        px={4}
        pb="calc(1.5rem + env(safe-area-inset-bottom, 0px))"
        gap={4}
        overflowY="auto"
      >
        {phase === Phase.load && (
          <Text fontSize="lg" mt={8}>
            Preparing Keystone sign request…
          </Text>
        )}
        {phase === Phase.showQr && urData.cbor && (
          <>
            <Text fontSize="md" textAlign="center" maxW="420px">
              Scan this QR with your Keystone. The animation may run for a minute
              or two while the full request is transferred; hold the device steady.
              Approve on the device, then tap below and scan the signature QR.
            </Text>
            <Box
              bg="white"
              p={3}
              rounded="lg"
              boxShadow="md"
              sx={{ '& video': { maxWidth: '100%' } }}
            >
              <AnimatedQRCode
                type={urData.type}
                cbor={urData.cbor}
                options={KEYSTONE_SIGN_ANIMATED_QR_OPTIONS}
              />
            </Box>
            <Button colorScheme="cyan" onClick={() => setPhase(Phase.scan)}>
              Scan signature from Keystone
            </Button>
          </>
        )}
        {phase === Phase.scan && (
          <>
            <Text fontSize="sm" textAlign="center" maxW="420px">
              Allow camera access if prompted. Scan the animated signature QR on
              Keystone.
            </Text>
            <Box
              w="full"
              maxW="480px"
              rounded="lg"
              overflow="hidden"
              bg="blackAlpha.800"
            >
              <AnimatedQRScanner
                urTypes={[URType.CardanoSignature]}
                handleScan={onSignatureScan}
                handleError={(msg) => setError(msg)}
                options={{ width: '100%', height: 280 }}
              />
            </Box>
            <Button variant="ghost" onClick={() => setPhase(Phase.showQr)}>
              Back to transaction QR
            </Button>
          </>
        )}
        {(phase === Phase.done || error) && (
          <Text
            fontSize="sm"
            color={error ? 'red.300' : 'inherit'}
            textAlign="center"
            mt={4}
          >
            {error || 'Done. You can close this tab.'}
          </Text>
        )}
      </Flex>
    </Box>
  );
};

const root = createRoot(
  window.document.querySelector(`#${TAB.keystoneTx}`)
);
root.render(
  <Main>
    <Router>
      <App />
    </Router>
  </Main>
);

if (module.hot) module.hot.accept();
