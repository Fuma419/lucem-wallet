/**
 * Full-page tab: show Cardano sign QR for Keystone, then scan signature QR.
 */

import React from 'react';
import '../components/styles.css';
import { TAB } from '../../../config/config';
import Main from '../../index';
import PreventHistoryBack from '../components/PreventHistoryBack';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { Box, Button, Image, Text, useToast } from '@chakra-ui/react';
import { AnimatedQRCode, AnimatedQRScanner } from '@keystonehq/animated-qr';
import { URType } from '@keystonehq/keystone-sdk';
import LogoWhite from '../../../assets/img/bannerBlack.png';
import backgroundGreenWebp from '../../../assets/img/background-green.webp';
import {
  clearKeystoneSignPayload,
  closeCurrentTab,
  getCurrentAccount,
  getUtxos,
  indexToHw,
  submitTx,
  takeKeystoneSignPayload,
} from '../../../api/extension';
import platform from '../../../platform';
import Loader from '../../../api/loader';
import { assembleSignedTransaction } from '../../../api/extension/wallet';
import { useStoreActions } from 'easy-peasy';
import {
  buildKeystoneCardanoSignRequest,
  KEYSTONE_SIGN_ANIMATED_QR_OPTIONS,
  parseKeystoneCardanoTxSignature,
  summarizeUnsignedPaymentTx,
  witnessSetHexFromKeystoneSignature,
} from '../../../api/keystone-cardano';
import KeystoneSDK from '@keystonehq/keystone-sdk';
import { ensureCameraPermission } from '../../../platform/capacitor';

const Phase = {
  load: 'load',
  showQr: 'showQr',
  scan: 'scan',
  done: 'done',
};

const App = () => {
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
  const [txSummary, setTxSummary] = React.useState(null);
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
        const parsedTx = Loader.Cardano.Transaction.from_bytes(
          Buffer.from(pending.txHex, 'hex')
        );
        if (!cancelled) {
          setTxSummary(summarizeUnsignedPaymentTx(parsedTx, utxos));
        }
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
      const rawTx = Loader.Cardano.Transaction.from_bytes(
        Buffer.from(txHex, 'hex')
      );
      const witnessSet = Loader.Cardano.TransactionWitnessSet.from_bytes(
        Buffer.from(witnessHex, 'hex')
      );
      const signed = await assembleSignedTransaction(rawTx, witnessSet);
      await submitTx(Buffer.from(signed.to_bytes(), 'hex').toString('hex'));
      const params = new URLSearchParams(window.location.search);
      const signId = params.get('signId');
      if (signId) await clearKeystoneSignPayload(signId);
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
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      width="100%"
      minW="100%"
      minH="100vh"
      position="relative"
      opacity={0.9}
      className="lucem-wallet-main-column"
      backgroundColor="#050f18"
      backgroundImage={`linear-gradient(165deg, rgba(12, 28, 10, 0.9) 0%, rgba(8, 38, 18, 0.84) 45%, rgba(6, 22, 12, 0.92) 100%), url(${backgroundGreenWebp})`}
      backgroundSize="cover, cover"
      backgroundPosition="center, center"
      backgroundRepeat="no-repeat, no-repeat"
      boxSizing="border-box"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
    >
      <Box
        as="header"
        width="100%"
        flexShrink={0}
        display="flex"
        justifyContent="flex-start"
        pt={{
          base: 'max(1rem, env(safe-area-inset-top, 0px))',
          md: 8,
        }}
        pb={{ base: 2, md: 2 }}
        px={{ base: 4, md: 8 }}
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
      <Box
        flex="1 1 auto"
        minH={0}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent={{ base: 'flex-start', md: 'center' }}
        width="100%"
        px={{ base: 4, md: 8 }}
        pb={{
          base: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
          md: 12,
        }}
        pt={{ base: 2, md: 0 }}
      >
        <Box
          className="modal-glow-yellow-green create-wallet-modal lucem-modal-card"
          rounded="2xl"
          shadow="md"
          display="flex"
          flexDirection="column"
          alignItems="stretch"
          width="100%"
          maxW="560px"
          mx="auto"
          flex="1 1 auto"
          minH={0}
          overflow="hidden"
          background="rgba(0, 0, 0, .85)"
          color="whiteAlpha.900"
          fontSize="md"
        >
          <Box
            className="lucem-create-wallet-scroll"
            p={{ base: 4, sm: 6, md: 10 }}
            flex="1 1 auto"
            minH={0}
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={4}
          >
            {phase === Phase.load && (
              <Text className="walletTitle" fontSize="lg" fontWeight="bold" mt={4} textAlign="center">
                Preparing Keystone sign request…
              </Text>
            )}
            {phase === Phase.showQr && urData.cbor && (
              <>
                <Text
                  className="walletTitle"
                  as="h2"
                  fontWeight="bold"
                  fontSize="xl"
                  textAlign="center"
                  width="100%"
                >
                  Sign with Keystone
                </Text>
                <Text fontSize="sm" textAlign="center" maxW="420px" color="whiteAlpha.800">
                  Scan this QR with your Keystone. Frames are sparse and slow so the
                  device camera can lock on; hold the device steady. Approve on the
                  device, then tap below and scan the signature QR.
                </Text>
                {txSummary ? (
                  <Box
                    data-testid="keystone-tx-summary"
                    w="full"
                    maxW="420px"
                    bg="blackAlpha.500"
                    rounded="xl"
                    p={3}
                    fontSize="xs"
                    color="whiteAlpha.900"
                  >
                    <Text fontWeight="bold" mb={2} letterSpacing="0.04em">
                      This transaction
                    </Text>
                    {txSummary.inputs.map((row, i) => (
                      <Text key={`in-${row.txHash}-${row.index}`} mb={1}>
                        Input {i + 1}: {row.ada != null ? `${row.ada} ADA` : 'UTxO'}{' '}
                        {row.address
                          ? `${row.address.slice(0, 10)}…${row.address.slice(-8)}`
                          : ''}
                      </Text>
                    ))}
                    {txSummary.outputs.map((row, i) => (
                      <Text key={`out-${row.address}-${i}`} mb={1}>
                        {row.kind === 'change' ? 'Change' : 'Send'} {i + 1}: {row.ada}{' '}
                        ADA {row.address.slice(0, 10)}…{row.address.slice(-8)}
                      </Text>
                    ))}
                    <Text mt={1}>Fee: {txSummary.feeAda} ADA</Text>
                    <Text mt={2} color="whiteAlpha.700">
                      Keystone lists every spent UTxO as Input and every destination
                      as Output. Change back to you is supposed to look like your
                      address on both sides.
                    </Text>
                  </Box>
                ) : null}
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
                <Button
                  type="button"
                  className="button hw-wallet"
                  onClick={async () => {
                    setError('');
                    const ok = await ensureCameraPermission();
                    if (!ok) {
                      setError(
                        'Camera access is required to scan the Keystone signature. Enable the camera permission for Lucem in your device settings.'
                      );
                      return;
                    }
                    setPhase(Phase.scan);
                  }}
                >
                  Scan signature from Keystone
                </Button>
              </>
            )}
            {phase === Phase.scan && (
              <>
                <Text
                  className="walletTitle"
                  as="h2"
                  fontWeight="bold"
                  fontSize="xl"
                  textAlign="center"
                  width="100%"
                >
                  Scan signature QR
                </Text>
                <Text fontSize="sm" textAlign="center" maxW="420px" color="whiteAlpha.800">
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
                <Button
                  variant="ghost"
                  color="whiteAlpha.800"
                  _hover={{ bg: 'whiteAlpha.100' }}
                  onClick={() => setPhase(Phase.showQr)}
                >
                  Back to transaction QR
                </Button>
              </>
            )}
            {(phase === Phase.done || error) && (
              <Box
                data-testid="keystone-tx-error"
                w="full"
                maxW="420px"
                mt={4}
                textAlign="center"
              >
                <Text
                  fontSize="sm"
                  color={error ? 'red.200' : 'whiteAlpha.800'}
                  whiteSpace="pre-wrap"
                  wordBreak="break-word"
                >
                  {error || 'Done. You can close this tab.'}
                </Text>
                {error ? (
                  <Box mt={3} display="flex" justifyContent="center" gap={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      color="whiteAlpha.900"
                      onClick={() => {
                        navigator.clipboard.writeText(error);
                        toast({
                          title: 'Error copied',
                          status: 'info',
                          duration: 1500,
                        });
                      }}
                    >
                      Copy error
                    </Button>
                    <Button
                      size="sm"
                      colorScheme="yellow"
                      onClick={() => platform.navigation.openMainRoute('/send')}
                    >
                      Back to Send
                    </Button>
                  </Box>
                ) : null}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const root = createRoot(
  window.document.querySelector(`#${TAB.keystoneTx}`)
);
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
