/**
 * hw.jsx is the entry point for the harware wallet extension tab
 */

import React from 'react';
import { HW, STORAGE, TAB } from '../../../config/config';
import Main from '../../index';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Box,
  Flex,
  useColorModeValue,
  useColorMode,
  Image,
  Text,
  Checkbox,
  Icon,
} from '@chakra-ui/react';
import { Scrollbars } from '../components/scrollbar';
import { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';


// assets
import LogoOriginal from '../../../assets/img/logo.svg';
import LogoWhite from '../../../assets/img/bannerBlack.png';
import LedgerLogo from '../../../assets/img/ledgerLogo.svg';
import KeystoneLogo from '../../../assets/img/imgKeystone.svg';
import { ChevronRightIcon } from '@chakra-ui/icons';
import TrezorWidget from '../components/trezorWidget';
import {
  closeCurrentTab,
  createHWAccounts,
  getHwAccounts,
  getStorage,
  indexToHw,
  initHW,
} from '../../../api/extension';
import { AnimatedQRCode, AnimatedQRScanner } from '@keystonehq/animated-qr';
import { URType } from '@keystonehq/keystone-sdk';
import {
  generateCardanoKeystoneKeyDerivationUr,
  parseKeystoneCardanoConnectUr,
} from '../../../api/keystone-cardano';
import { MdUsb } from 'react-icons/md';
import { Planet } from 'react-kawaii';
import { ledgerUSBVendorId } from '@ledgerhq/devices';

const VENDOR_IDS = {
  ledger: [ledgerUSBVendorId],
  trezor: [0x534c, 0x1209], // Model T HID 0x534c and others 0x1209 - taken from https://github.com/vacuumlabs/trezor-suite/blob/develop/packages/transport/src/constants.ts#L13-L21
  keystone: 'keystone',
};

const App = () => {
  const Logo = useColorModeValue(LogoOriginal, LogoWhite);
  const cardColor = useColorModeValue('blue.100', 'gray.900');
  const backgroundColor = useColorModeValue('gray.200', 'inherit');
  const [tab, setTab] = React.useState(0);
  const data = React.useRef({
    device: '',
    id: '',
    keystoneAccounts: null,
  });

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
      <Flex
        flexShrink={0}
        align="center"
        px={{ base: 4, md: 10 }}
        pt={{
          base: 'max(1rem, env(safe-area-inset-top, 0px))',
          md: 10,
        }}
        pb={4}
      >
        <Image
          draggable={false}
          src={Logo}
          w={{ base: 'min(160px, 55vw)', md: '190px' }}
          maxW="190px"
          alt=""
        />
      </Flex>

      <Box
        flex="1"
        minH={0}
        display="flex"
        justifyContent="center"
        alignItems={{ base: 'stretch', md: 'center' }}
        px={{ base: 4, md: 6 }}
        pb="calc(1rem + env(safe-area-inset-bottom, 0px))"
        py={{ base: 2, md: 4 }}
      >
        <Box
          rounded="2xl"
          shadow="md"
          display="flex"
          alignItems="stretch"
          flexDirection="column"
          w="full"
          maxW="460px"
          minH={0}
          flex={{ base: '1 1 auto', md: '0 1 auto' }}
          p={{ base: 6, md: 10 }}
          background={cardColor}
          fontSize="sm"
          overflow="hidden"
          sx={{
            maxHeight: 'min(34.375rem, calc(100dvh - 9rem))',
            '@supports not (height: 100dvh)': {
              maxHeight: 'min(34.375rem, calc(100vh - 9rem))',
            },
          }}
        >
          <Box flex="1" minH={0} overflowY="auto" display="flex" flexDirection="column">
            {tab === 0 && (
              <ConnectHW
                onConfirm={({ device, id, keystoneAccounts }) => {
                  data.current = { device, id, keystoneAccounts };
                  setTab(1);
                }}
              />
            )}
            {tab === 1 && (
              <SelectAccounts data={data.current} onConfirm={() => setTab(2)} />
            )}
            {tab === 2 && <SuccessAndClose />}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const ConnectHW = ({ onConfirm }) => {
  const { colorMode } = useColorMode();
  const [selected, setSelected] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [keystoneStep, setKeystoneStep] = React.useState('pick');
  const [scanError, setScanError] = React.useState('');

  const keyDerivationUr = React.useMemo(
    () => generateCardanoKeystoneKeyDerivationUr(),
    []
  );

  if (selected === HW.keystone && keystoneStep === 'showRequest') {
    const cborHex = Buffer.from(keyDerivationUr.cbor).toString('hex');
    return (
      <>
        <Text fontSize="x-large" fontWeight="semibold">
          Step 1 — Keystone scans Lucem
        </Text>
        <Box h={4} />
        <Text fontSize="sm" maxW="340px">
          On your Keystone, open the <b>scanner / camera</b> flow used to
          connect a software wallet (often under <b>Software Wallet</b> or{' '}
          <b>Connect Wallet</b>). Point the device camera at the animated QR
          below and approve the Cardano key request on the device.
        </Text>
        <Box h={4} />
        <Box
          alignSelf="center"
          bg="white"
          p={3}
          rounded="lg"
          boxShadow="md"
          maxW="100%"
        >
          <AnimatedQRCode
            type={keyDerivationUr.type}
            cbor={cborHex}
            options={{ size: 220, capacity: 400, interval: 100 }}
          />
        </Box>
        <Box h={4} />
        <Text fontSize="sm" maxW="340px" color="gray.600">
          When Keystone shows its animated QR (Account 1 / default path), tap
          Continue here and allow the webcam to scan it.
        </Text>
        <Button
          mt={4}
          colorScheme="cyan"
          rightIcon={<ChevronRightIcon />}
          onClick={() => {
            setScanError('');
            setKeystoneStep('scanReply');
          }}
        >
          Continue to scan Keystone QR
        </Button>
        <Button
          mt={2}
          variant="ghost"
          onClick={() => setKeystoneStep('pick')}
        >
          Back
        </Button>
      </>
    );
  }

  if (selected === HW.keystone && keystoneStep === 'scanReply') {
    return (
      <>
        <Text fontSize="x-large" fontWeight="semibold">
          Step 2 — Scan Keystone
        </Text>
        <Box h={4} />
        <Text fontSize="sm" maxW="320px">
          Scan the animated QR on your Keystone screen. Allow the camera when
          the browser asks.
        </Text>
        <Box h={4} />
        <Box
          w="full"
          maxW="400px"
          minH="220px"
          rounded="md"
          overflow="hidden"
          bg="blackAlpha.700"
          alignSelf="center"
        >
          <AnimatedQRScanner
            urTypes={[URType.CryptoMultiAccounts, URType.CryptoHDKey]}
            handleScan={(data) => {
              try {
                const { masterFingerprint, keys } =
                  parseKeystoneCardanoConnectUr(data);
                onConfirm({
                  device: HW.keystone,
                  id: masterFingerprint,
                  keystoneAccounts: keys,
                });
              } catch (e) {
                setScanError(e.message || 'Could not read QR');
              }
            }}
            handleError={(msg) => setScanError(msg)}
            options={{ width: '100%', height: 260 }}
          />
        </Box>
        {scanError && (
          <Text fontSize="xs" color="red.300" mt={2}>
            {scanError}
          </Text>
        )}
        <Button
          mt={4}
          variant="ghost"
          onClick={() => {
            setScanError('');
            setKeystoneStep('showRequest');
          }}
        >
          Back to Step 1
        </Button>
      </>
    );
  }

  return (
    <>
      <Text fontSize="x-large" fontWeight="semibold">
        Connect Hardware Wallet
      </Text>
      <Box h={6} />
      <Text width="300px">
        Choose <b>Keystone</b> (QR, air-gapped) or <b>Ledger</b> (USB).
      </Text>
      <Box h={8} />
      <Box display="flex" alignItems="center" justifyContent="center">
        <Box
          cursor="pointer"
          display="flex"
          alignItems="center"
          justifyContent="center"
          width="120px"
          height="55px"
          border="solid 1px"
          rounded="xl"
          borderColor={selected === HW.keystone && 'cyan.400'}
          borderWidth={selected === HW.keystone && '3px'}
          p={4}
          _hover={{ opacity: 0.85 }}
          onClick={() => {
            setSelected(HW.keystone);
            setKeystoneStep('pick');
            setError('');
            setScanError('');
          }}
        >
          <Image
            draggable={false}
            src={KeystoneLogo}
            filter={colorMode == 'dark' && 'invert(1)'}
          />
        </Box>
        <Box w={5} />
        <Box
          cursor="pointer"
          display="flex"
          alignItems="center"
          justifyContent="center"
          width="120px"
          height="55px"
          border="solid 1px"
          rounded="xl"
          borderColor={selected === HW.ledger && 'purple.400'}
          borderWidth={selected === HW.ledger && '3px'}
          p={1}
          _hover={{ opacity: 0.8 }}
          onClick={() => setSelected(HW.ledger)}
        >
          <Image
            draggable={false}
            src={LedgerLogo}
            filter={colorMode == 'dark' && 'invert(1)'}
          />
        </Box>
      </Box>
      <Box h={10} />
      {selected === HW.keystone && (
        <Text width="340px" fontSize="sm">
          Two-step air-gapped link: Lucem shows a QR for Keystone to scan first,
          then you scan Keystone&apos;s QR with this device. No USB.
        </Text>
      )}
      {selected === HW.ledger && (
        <Text width="300px">
          Connect your <b>Ledger</b> device directly to your computer. Unlock
          the device and open the Cardano app. Then click Continue.
        </Text>
      )}
      {selected === HW.ledger && <Icon as={MdUsb} boxSize={7} mt="6" />}
      <Button
        isDisabled={isLoading || !selected}
        isLoading={isLoading}
        mt="auto"
        rightIcon={<ChevronRightIcon />}
        onClick={async () => {
          setError('');
          if (selected === HW.keystone) {
            setKeystoneStep('showRequest');
            setScanError('');
            return;
          }
          setIsLoading(true);
          try {
            const device = await navigator.usb.requestDevice({
              filters: [],
            });
            if (
              !VENDOR_IDS[selected].some(
                (vendorId) => vendorId === device.vendorId
              )
            ) {
              setError('Device is not a Ledger');
              setIsLoading(false);
              return;
            }
            try {
              await initHW({ device: selected, id: device.productId });
            } catch (e) {
              setError('Cardano app not opened');
              setIsLoading(false);
              return;
            }
            onConfirm({ device: selected, id: device.productId });
          } catch (e) {
            setError('Device not found');
          }
          setIsLoading(false);
        }}
      >
        Continue
      </Button>

      {error && (
        <Text mt={3} fontSize="xs" color="red.300">
          {error}
        </Text>
      )}
    </>
  );
};

const SelectAccounts = ({ data, onConfirm }) => {
  const [selected, setSelected] = React.useState({ 0: true });
  const [error, setError] = React.useState('');
  const trezorRef = React.useRef();
  const [existing, setExisting] = React.useState({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isInit, setIsInit] = React.useState(false);

  const isKeystone =
    data.device === HW.keystone &&
    Array.isArray(data.keystoneAccounts) &&
    data.keystoneAccounts.length > 0;

  const getExistingAccounts = async () => {
    const accounts = await getStorage(STORAGE.accounts);
    const hwAccounts = getHwAccounts(accounts, {
      device: data.device,
      id: data.id,
    });
    const existingMap = {};
    Object.keys(hwAccounts).forEach(
      (accountIndex) =>
        (existingMap[String(indexToHw(accountIndex).account)] = true)
    );
    setExisting(existingMap);
    setIsInit(true);
  };
  React.useEffect(() => {
    getExistingAccounts();
  }, []);

  React.useEffect(() => {
    if (!isInit || !isKeystone) return;
    const next = {};
    data.keystoneAccounts.forEach((k) => {
      const s = String(k.account);
      if (!existing[s]) next[s] = true;
    });
    setSelected(next);
  }, [isInit, isKeystone, data.keystoneAccounts, existing]);

  const ledgerRows = Object.keys([...Array(50)]);
  const keystoneRows = isKeystone
    ? data.keystoneAccounts.map((k) => String(k.account))
    : [];

  return (
    isInit && (
      <>
        <Text fontSize="x-large" fontWeight="semibold">
          Select Accounts
        </Text>
        <Box h={6} />
        <Text width="300px">
          {isKeystone
            ? data.keystoneAccounts.length === 1
              ? 'Confirm adding this Cardano account (Account 1).'
              : 'Choose which Cardano accounts from this Keystone sync QR to add.'
            : 'Select the accounts you would like to import. Afterwards click Continue and follow the instructions on your device.'}
        </Text>
        <Box h={8} />

        <Box
          width="80%"
          minH="160px"
          h="200px"
          rounded="md"
          border="solid 1px"
          sx={{ maxHeight: 'min(16.25rem, 42vh)' }}
        >
          <Scrollbars
            style={{
              width: '100%',
              height: '100%',
            }}
            autoHide
          >
            {(isKeystone ? keystoneRows : ledgerRows).map((accountIndex) => (
              <Box
                key={accountIndex}
                opacity={existing[accountIndex] ? 0.7 : 1}
                width="80%"
                my={4}
                display="flex"
                alignItems="center"
              >
                <Box ml={6} fontWeight="bold">
                  Account {parseInt(accountIndex, 10) + 1}{' '}
                  {accountIndex === '0' && ' - Default'}
                </Box>
                <Checkbox
                  isDisabled={!!existing[accountIndex]}
                  isChecked={
                    !!(selected[accountIndex] && !existing[accountIndex])
                  }
                  onChange={(e) =>
                    setSelected((s) => ({
                      ...s,
                      [accountIndex]: e.target.checked,
                    }))
                  }
                  ml="auto"
                />
              </Box>
            ))}
          </Scrollbars>
        </Box>
        <Button
          isDisabled={
            isLoading ||
            Object.keys(selected).filter((s) => selected[s] && !existing[s])
              .length <= 0
          }
          isLoading={isLoading}
          mt="auto"
          rightIcon={<ChevronRightIcon />}
          onClick={async () => {
            setIsLoading(true);
            setError('');
            const accountIndexes = Object.keys(selected).filter(
              (s) => selected[s] && !existing[s]
            );
            try {
              const { device, id, keystoneAccounts } = data;
              let accounts;
              if (device === HW.ledger) {
                const appAda = await initHW({ device, id });
                const ledgerKeys = await appAda.getExtendedPublicKeys({
                  paths: accountIndexes.map((index) => [
                    HARDENED + 1852,
                    HARDENED + 1815,
                    HARDENED + parseInt(index, 10),
                  ]),
                });
                accounts = ledgerKeys.map(
                  ({ publicKeyHex, chainCodeHex }, index) => ({
                    accountIndex: `${HW.ledger}-${id}-${accountIndexes[index]}`,
                    publicKey: publicKeyHex + chainCodeHex,
                    name: `Ledger ${parseInt(accountIndexes[index], 10) + 1}`,
                  })
                );
              } else if (device === HW.keystone) {
                accounts = accountIndexes.map((accStr) => {
                  const k = keystoneAccounts.find(
                    (x) => String(x.account) === accStr
                  );
                  if (!k) throw new Error('Missing Keystone account key');
                  return {
                    accountIndex: `${HW.keystone}-${id}-${accStr}`,
                    publicKey: k.publicKey,
                    name: k.name,
                  };
                });
              }
              if (!accounts || accounts.length === 0) {
                throw new Error('No accounts selected');
              }
              await createHWAccounts(accounts);
              return onConfirm();
            } catch (e) {
              console.warn(e);
              setError('An error occured');
            }

            setIsLoading(false);
          }}
        >
          Continue
        </Button>
        {error && (
          <Text mt={3} fontSize="xs" color="red.300">
            {error}
          </Text>
        )}
        <TrezorWidget ref={trezorRef} />
      </>
    )
  );
};

const SuccessAndClose = () => {
  return (
    <>
      <Text
        mt={10}
        fontSize="x-large"
        fontWeight="semibold"
        width={200}
        textAlign="center"
      >
        Successfully added accounts!
      </Text>
      <Box h={10} />
      <Text width="300px">
        You can now close this tab and continue with the extension.
      </Text>
      <Button mt="auto" onClick={() => closeCurrentTab()}>
        Close
      </Button>
    </>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.hw}`));
root.render(
    <Main>
      <Router>
        <App />
      </Router>
    </Main>
);

if (module.hot) module.hot.accept();
