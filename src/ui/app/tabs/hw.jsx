/**
 * hw.jsx is the entry point for the harware wallet extension tab
 */

import React from 'react';
import '../components/styles.css';
import { HW, STORAGE, TAB } from '../../../config/config';
import Main from '../../index';
import PreventHistoryBack from '../components/PreventHistoryBack';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Box,
  Image,
  Text,
  Checkbox,
  Icon,
  Collapse,
  Radio,
  RadioGroup,
  Stack,
  Input,
} from '@chakra-ui/react';
import {
  Scrollbars,
  lucemTransparentScrollView,
} from '../components/scrollbar';
import { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';


import LogoWhite from '../../../assets/img/bannerBlack.png';
import backgroundPurpleWebp from '../../../assets/img/background-purple.webp';
import LedgerLogo from '../../../assets/img/ledgerLogo.svg';
import KeystoneLogo from '../../../assets/img/imgKeystone.svg';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import TrezorWidget from '../components/trezorWidget';
import {
  closeCurrentTab,
  createHWAccounts,
  getHwAccounts,
  getStorage,
  indexToHw,
  initHW,
  initLocalWalletSecretIfAbsent,
  keystoneImportRowKey,
} from '../../../api/extension';
import { AnimatedQRCode, AnimatedQRScanner } from '@keystonehq/animated-qr';
import { URType } from '@keystonehq/keystone-sdk';
import {
  KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX,
  KEYSTONE_DERIVATION,
  filterKeystoneKeysForRequestedAccounts,
  formatKeystoneCardanoAccountLabel,
  generateCardanoKeystoneKeyDerivationUr,
  keystoneAccountStorageSuffix,
  parseKeystoneCardanoConnectUr,
} from '../../../api/keystone-cardano';
import { MdBluetooth } from 'react-icons/md';
import { getBluetoothServiceUuids } from '@ledgerhq/devices';

const ledgerBleRequestOptions = () => {
  const uuids = getBluetoothServiceUuids();
  return {
    filters: uuids.map((uuid) => ({ services: [uuid] })),
    optionalServices: uuids,
  };
};

/** Purple accent used for hardware wallet flow to align with new-wallet styling. */
const HW_PURPLE = '#dc1bfa';
const HW_ACCENT = {
  border: 'rgba(220, 27, 250, 0.92)',
  borderMuted: 'rgba(220, 27, 250, 0.48)',
  bgSelected: 'rgba(220, 27, 250, 0.14)',
  bgHover: 'rgba(220, 27, 250, 0.12)',
  glow:
    '0 0 22px rgba(220, 27, 250, 0.38), inset 0 1px 0 rgba(255,255,255,0.12)',
  glowHover: '0 0 18px rgba(220, 27, 250, 0.32)',
  inset: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  panelBorder: 'rgba(220, 27, 250, 0.38)',
  panelGlow:
    '0 0 22px rgba(220, 27, 250, 0.14), inset 0 1px 0 rgba(255,255,255,0.06)',
  panelBg:
    'linear-gradient(165deg, rgba(31, 9, 47, 0.94) 0%, rgba(20, 9, 32, 0.92) 100%)',
  inputBorder: 'rgba(220, 27, 250, 0.32)',
  inputFocusRing: '0 0 0 1px rgba(220, 27, 250, 0.55)',
};

/** Lime-accented controls on dark panels (aligned with welcome HW button). */
const hwPanelCheckboxSx = {
  '.chakra-checkbox__control': {
    borderColor: 'rgba(255,255,255,0.38)',
    bg: 'rgba(0,0,0,0.35)',
    _checked: {
      bg: HW_PURPLE,
      borderColor: HW_PURPLE,
      color: 'gray.900',
    },
    _hover: { borderColor: 'rgba(220, 27, 250, 0.65)' },
  },
};

const hwPanelRadioSx = {
  '.chakra-radio__control': {
    borderColor: 'rgba(255,255,255,0.38)',
    bg: 'rgba(0,0,0,0.3)',
    _checked: {
      bg: HW_PURPLE,
      borderColor: HW_PURPLE,
      color: 'gray.900',
    },
    _hover: { borderColor: 'rgba(220, 27, 250, 0.65)' },
  },
};

/** CIP-1852 account checkboxes: only account 0 on by default (Cardano standard path). */
function defaultKeystoneAccountChecks() {
  const o = {};
  for (let i = 0; i <= KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX; i += 1) {
    o[i] = false;
  }
  o[0] = true;
  return o;
}

const App = () => {
  const [tab, setTab] = React.useState(0);
  const data = React.useRef({
    device: '',
    id: '',
    keystoneAccounts: null,
  });

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
      backgroundImage={`linear-gradient(165deg, rgba(32, 5, 55, 0.9) 0%, rgba(20, 8, 32, 0.84) 45%, rgba(8, 6, 16, 0.92) 100%), url(${backgroundPurpleWebp})`}
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
          className="modal-glow-purple create-wallet-modal lucem-modal-card"
          rounded="2xl"
          shadow="md"
          display="flex"
          flexDirection="column"
          alignItems="stretch"
          justifyContent="flex-start"
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
          >
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
  const [selected, setSelected] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [keystoneStep, setKeystoneStep] = React.useState('pick');
  const [scanError, setScanError] = React.useState('');
  /** Prevents animated QR from firing multiple successful imports in one session */
  const keystoneScanConsumedRef = React.useRef(false);
  const [keystoneAdvancedOpen, setKeystoneAdvancedOpen] = React.useState(false);
  const [keystoneAccountChecks, setKeystoneAccountChecks] = React.useState(
    () => defaultKeystoneAccountChecks()
  );
  /** Must match Keystone ADA export: standard (default) vs Ledger-compatible */
  const [keystoneDerivation, setKeystoneDerivation] = React.useState('standard');

  const keystoneRequestedIndices = React.useMemo(() => {
    return Object.keys(keystoneAccountChecks)
      .map((k) => parseInt(k, 10))
      .filter(
        (i) =>
          !Number.isNaN(i) &&
          i >= 0 &&
          i <= KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX &&
          keystoneAccountChecks[i]
      )
      .sort((a, b) => a - b);
  }, [keystoneAccountChecks]);

  const keyDerivationUr = React.useMemo(
    () =>
      generateCardanoKeystoneKeyDerivationUr({
        accountIndices: keystoneRequestedIndices,
      }),
    [keystoneRequestedIndices]
  );

  const keystoneQrCapacity = React.useMemo(
    () => Math.min(900, 280 + keystoneRequestedIndices.length * 55),
    [keystoneRequestedIndices.length]
  );

  /** animated-qr BaseQRScanner pins decode callback on mount (`useEffect([], …)`); keep latest choices here. */
  const keystoneDerivationRef = React.useRef(keystoneDerivation);
  const keystoneRequestedIndicesRef = React.useRef(keystoneRequestedIndices);
  React.useLayoutEffect(() => {
    keystoneDerivationRef.current = keystoneDerivation;
    keystoneRequestedIndicesRef.current = keystoneRequestedIndices;
  }, [keystoneDerivation, keystoneRequestedIndices]);

  if (selected === HW.keystone && keystoneStep === 'showRequest') {
    const cborHex = Buffer.from(keyDerivationUr.cbor).toString('hex');
    return (
      <Box
        width="100%"
        display="flex"
        flexDirection="column"
        alignItems="center"
      >
        <Text
          className="walletTitle"
          as="h2"
          textAlign="center"
          fontWeight="bold"
          fontSize="xl"
          width="100%"
        >
          Step 1 — Keystone scans Lucem
        </Text>
        <Box h={4} />
        <Text fontSize="sm" maxW="340px" color="whiteAlpha.800" textAlign="center" mx="auto">
          This QR asks Keystone for{' '}
          <b>
            {keystoneRequestedIndices.length === 1
              ? `account ${keystoneRequestedIndices[0]}`
              : `${keystoneRequestedIndices.length} accounts (${keystoneRequestedIndices.join(', ')})`}
          </b>
          . Use the same <b>ADA derivation</b> on the device as in Lucem (
          {keystoneDerivation === 'ledger'
            ? 'Ledger-compatible'
            : 'Cardano standard'}
          ). Open the <b>scanner</b>, scan this QR, and approve. More accounts take longer
          on the device.
        </Text>
        {keystoneDerivation === 'ledger' && (
          <Text
            fontSize="xs"
            color="orange.200"
            maxW="340px"
            mt={3}
            fontWeight="semibold"
            textAlign="center"
            mx="auto"
          >
            Keystone defaults to Cardano standard on the approval screen. When
            the device asks you to confirm, switch ADA to Ledger / BitBox — not
            the default — or imported addresses will not match Ledger.
          </Text>
        )}
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
            options={{
              size: 220,
              capacity: keystoneQrCapacity,
              interval: 110,
            }}
          />
        </Box>
        <Box h={4} />
        <Text fontSize="sm" maxW="340px" color="whiteAlpha.650" textAlign="center" mx="auto">
          When Keystone shows its animated sync QR, tap Continue here and allow
          the webcam to scan it. To add another account later, open this flow
          again after choosing a different account on the device.
        </Text>
        <Button
          type="button"
          variant="unstyled"
          className="button new-wallet hw-tab-cta"
          mt={4}
          alignSelf="center"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
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
          alignSelf="center"
          color="whiteAlpha.800"
          _hover={{ bg: 'whiteAlpha.100' }}
          _active={{ bg: 'whiteAlpha.200' }}
          onClick={() => {
            keystoneScanConsumedRef.current = false;
            setKeystoneStep('pick');
          }}
        >
          Back
        </Button>
      </Box>
    );
  }

  if (selected === HW.keystone && keystoneStep === 'scanReply') {
    return (
      <Box
        width="100%"
        display="flex"
        flexDirection="column"
        alignItems="center"
      >
        <Text
          className="walletTitle"
          as="h2"
          textAlign="center"
          fontWeight="bold"
          fontSize="xl"
          width="100%"
        >
          Step 2 — Scan Keystone
        </Text>
        <Box h={4} />
        <Text fontSize="sm" maxW="320px" color="whiteAlpha.800" textAlign="center" mx="auto">
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
                if (keystoneScanConsumedRef.current) return;
                const deriv = keystoneDerivationRef.current;
                const indices = keystoneRequestedIndicesRef.current;
                const { masterFingerprint, keys } =
                  parseKeystoneCardanoConnectUr(data, {
                    forceExportProfile:
                      deriv === 'ledger'
                        ? KEYSTONE_DERIVATION.ledger
                        : KEYSTONE_DERIVATION.standard,
                  });
                const filtered = filterKeystoneKeysForRequestedAccounts(
                  keys,
                  indices
                );
                keystoneScanConsumedRef.current = true;
                onConfirm({
                  device: HW.keystone,
                  id: masterFingerprint,
                  keystoneAccounts: filtered,
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
          <Text fontSize="xs" color="red.200" mt={2} textAlign="center">
            {scanError}
          </Text>
        )}
        <Button
          mt={4}
          variant="ghost"
          alignSelf="center"
          color="whiteAlpha.800"
          _hover={{ bg: 'whiteAlpha.100' }}
          _active={{ bg: 'whiteAlpha.200' }}
          onClick={() => {
            setScanError('');
            keystoneScanConsumedRef.current = false;
            setKeystoneStep('showRequest');
          }}
        >
          Back to Step 1
        </Button>
      </Box>
    );
  }

  return (
    <Box
      width="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
    >
      <Text
        className="walletTitle"
        as="h2"
        textAlign="center"
        fontWeight="bold"
        fontSize="xl"
        width="100%"
      >
        Connect Hardware Wallet
      </Text>
      <Box h={6} />
      <Text
        width="90%"
        maxWidth="320px"
        textAlign="center"
        mx="auto"
        fontSize="sm"
        color="whiteAlpha.800"
      >
        Choose <b>Keystone</b> (QR, air-gapped) or <b>Ledger</b> (Bluetooth).
      </Text>
      <Box h={8} />
      <Box display="flex" alignItems="stretch" justifyContent="center" gap={4} flexWrap="wrap">
        <Box
          as="button"
          type="button"
          cursor="pointer"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={2}
          minW="132px"
          minH="108px"
          px={3}
          py={3}
          rounded="xl"
          transition="box-shadow 0.2s, border-color 0.2s, background 0.2s"
          border="solid 2px"
          borderColor={
            selected === HW.keystone ? HW_ACCENT.border : 'whiteAlpha.500'
          }
          bg={
            selected === HW.keystone
              ? HW_ACCENT.bgSelected
              : 'rgba(255, 255, 255, 0.07)'
          }
          boxShadow={
            selected === HW.keystone ? HW_ACCENT.glow : HW_ACCENT.inset
          }
          _hover={{
            borderColor: HW_ACCENT.border,
            bg: HW_ACCENT.bgHover,
            boxShadow: HW_ACCENT.glowHover,
          }}
          onClick={() => {
            setSelected(HW.keystone);
            setKeystoneStep('pick');
            keystoneScanConsumedRef.current = false;
            setKeystoneAccountChecks(defaultKeystoneAccountChecks());
            setKeystoneDerivation('standard');
            setKeystoneAdvancedOpen(false);
            setError('');
            setScanError('');
          }}
        >
          <Box
            bg="white"
            rounded="lg"
            px={3}
            py={2}
            boxShadow="0 2px 12px rgba(0,0,0,0.35)"
          >
            <Image draggable={false} src={KeystoneLogo} maxH="32px" objectFit="contain" />
          </Box>
          <Text fontSize="xs" fontWeight="bold" color="whiteAlpha.900" letterSpacing="wide">
            KEYSTONE
          </Text>
        </Box>
        <Box
          as="button"
          type="button"
          cursor="pointer"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={2}
          minW="132px"
          minH="108px"
          px={3}
          py={3}
          rounded="xl"
          transition="box-shadow 0.2s, border-color 0.2s, background 0.2s"
          border="solid 2px"
          borderColor={
            selected === HW.ledger ? HW_ACCENT.border : 'whiteAlpha.500'
          }
          bg={
            selected === HW.ledger
              ? HW_ACCENT.bgSelected
              : 'rgba(255, 255, 255, 0.07)'
          }
          boxShadow={
            selected === HW.ledger ? HW_ACCENT.glow : HW_ACCENT.inset
          }
          _hover={{
            borderColor: HW_ACCENT.border,
            bg: HW_ACCENT.bgHover,
            boxShadow: HW_ACCENT.glowHover,
          }}
          onClick={() => setSelected(HW.ledger)}
        >
          <Box
            bg="rgba(255,255,255,0.95)"
            rounded="lg"
            px={3}
            py={2}
            minH="44px"
            minW="120px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            boxShadow="0 2px 12px rgba(0,0,0,0.35)"
          >
            <Image
              draggable={false}
              src={LedgerLogo}
              alt="Ledger"
              w="112px"
              h="30px"
              maxW="100%"
              objectFit="contain"
            />
          </Box>
          <Text fontSize="xs" fontWeight="bold" color="whiteAlpha.900" letterSpacing="wide">
            LEDGER
          </Text>
        </Box>
      </Box>
      <Box h={10} />
      {selected === HW.keystone && (
        <Box
          w="100%"
          maxW="400px"
          alignSelf="stretch"
          mx="auto"
          display="flex"
          flexDirection="column"
          alignItems="center"
        >
          <Text width="100%" fontSize="sm" color="whiteAlpha.800" textAlign="center">
            By default Lucem connects <b>account 0</b> using{' '}
            <b>Cardano standard</b> derivation (CIP-1852). Open{' '}
            <b>Advanced options</b> to request more accounts (at least one) or
            Ledger-compatible keys — settings must match Keystone when you approve the
            QR.
          </Text>
          <Box h={4} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            alignSelf="stretch"
            maxW="400px"
            mx="auto"
            w="100%"
            borderColor={HW_ACCENT.borderMuted}
            color="whiteAlpha.900"
            bg="rgba(220, 27, 250, 0.08)"
            _hover={{
                  bg: 'rgba(220, 27, 250, 0.16)',
              borderColor: HW_ACCENT.border,
            }}
            _active={{ bg: 'rgba(220, 27, 250, 0.22)' }}
            rightIcon={
              <ChevronDownIcon
                transform={keystoneAdvancedOpen ? 'rotate(-180deg)' : undefined}
                transition="transform 0.2s"
              />
            }
            onClick={() => setKeystoneAdvancedOpen((o) => !o)}
          >
            Advanced options
          </Button>
          <Collapse in={keystoneAdvancedOpen} animateOpacity style={{ width: '100%' }}>
            <Box
              mt={3}
              w="100%"
              rounded="xl"
              px={{ base: 3, sm: 4 }}
              py={4}
              bg={HW_ACCENT.panelBg}
              borderWidth="1px"
              borderColor={HW_ACCENT.panelBorder}
              boxShadow={HW_ACCENT.panelGlow}
              backdropFilter="blur(10px)"
            >
              <Text fontSize="sm" fontWeight="semibold" color="whiteAlpha.900">
                Accounts to request (at least one)
              </Text>
              <Text fontSize="xs" color="whiteAlpha.650" mt={1} maxW="340px">
                Each checked account adds a derivation step on Keystone (more checks =
                longer approval). Scroll the card to see all options and Continue below.
              </Text>
              <Stack spacing={1} mt={2} pr={1}>
                {Array.from(
                  { length: KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX + 1 },
                  (_, i) => (
          <Checkbox
                      key={i}
                      size="sm"
            colorScheme="purple"
                      sx={{
                        ...hwPanelCheckboxSx,
                        '.chakra-checkbox__label': { color: 'whiteAlpha.850' },
                      }}
                      isChecked={!!keystoneAccountChecks[i]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const n = Object.values(keystoneAccountChecks).filter(
                          Boolean
                        ).length;
                        if (!checked && n <= 1) return;
                        setKeystoneAccountChecks((prev) => ({
                          ...prev,
                          [i]: checked,
                        }));
                      }}
                    >
                      Account {i} — m/1852&apos;/1815&apos;/{i}&apos;
                    </Checkbox>
                  )
                )}
              </Stack>
              <Text fontSize="sm" fontWeight="semibold" mt={4} color="whiteAlpha.900">
                ADA derivation (two supported paths)
              </Text>
              <RadioGroup
                name="keystone-ada-derivation"
                value={keystoneDerivation}
                onChange={(v) =>
                  setKeystoneDerivation(v === 'ledger' ? 'ledger' : 'standard')
                }
                mt={2}
                pb={1}
              >
                <Stack spacing={2} color="whiteAlpha.850">
                  <Radio
                    value="standard"
                    size="sm"
              colorScheme="purple"
                    sx={{
                      ...hwPanelRadioSx,
                      '.chakra-radio__label': { color: 'whiteAlpha.850' },
                    }}
                  >
                    Cardano standard (default)
                  </Radio>
                  <Radio
                    value="ledger"
                    size="sm"
              colorScheme="purple"
                    sx={{
                      ...hwPanelRadioSx,
                      '.chakra-radio__label': { color: 'whiteAlpha.850' },
                    }}
                  >
                    Ledger-compatible (Ledger / BitBox)
                  </Radio>
                </Stack>
              </RadioGroup>
              <Text fontSize="xs" color="whiteAlpha.650" mt={2} maxW="340px">
                Must match the address type you export on Keystone (Ledger vs
                standard use different keys at the same path). If a scan error says
                the QR does not match your choice, switch this option to the other
                type or re-export on the device so the QR tags match.
              </Text>
            </Box>
          </Collapse>
        </Box>
      )}
      {selected === HW.ledger && (
        <Text
          width="90%"
          maxWidth="320px"
          textAlign="center"
          mx="auto"
          fontSize="sm"
          color="whiteAlpha.800"
        >
          {typeof navigator !== 'undefined' && navigator.bluetooth
            ? 'Use a Bluetooth-capable Ledger (Nano X, Flex, Stax, etc.). Unlock it, enable Bluetooth on the device, open the Cardano app, then tap Continue and pick your Ledger in the browser dialog.'
            : 'Web Bluetooth is not available here. Use Chrome or Edge on desktop or the Lucem web app over HTTPS, with Bluetooth enabled. Note: some extension pages cannot use Web Bluetooth — open the hardware wallet flow in a normal browser tab if pairing fails.'}
        </Text>
      )}
      {selected === HW.ledger && (
        <Icon
          as={MdBluetooth}
          boxSize={7}
          mt="6"
          color={HW_PURPLE}
          alignSelf="center"
        />
      )}
      <Button
        type="button"
        variant="unstyled"
        className="button new-wallet hw-tab-cta"
        isDisabled={isLoading || !selected}
        isLoading={isLoading}
        mt={8}
        alignSelf="center"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        rightIcon={<ChevronRightIcon />}
        onClick={async () => {
          setError('');
          if (selected === HW.keystone) {
            if (keystoneRequestedIndices.length < 1) {
              setError('Select at least one Cardano account (Advanced).');
              return;
            }
            setKeystoneStep('showRequest');
            setScanError('');
            return;
          }
          setIsLoading(true);
          try {
            if (!navigator.bluetooth) {
              setError(
                'Web Bluetooth is not supported in this browser or context.'
              );
              setIsLoading(false);
              return;
            }
            let bleDevice;
            try {
              bleDevice = await navigator.bluetooth.requestDevice(
                ledgerBleRequestOptions()
              );
            } catch (e) {
              if (e && e.name === 'NotFoundError') {
                setError('No device selected or pairing was cancelled.');
              } else {
                setError(
                  e && e.message
                    ? String(e.message)
                    : 'Could not open Bluetooth device picker.'
                );
              }
              setIsLoading(false);
              return;
            }
            try {
              await initHW({
                device: selected,
                id: bleDevice.id,
                bleDevice,
              });
            } catch (e) {
              setError(
                e && e.message
                  ? String(e.message)
                  : 'Cardano app not opened or Bluetooth connection failed.'
              );
              setIsLoading(false);
              return;
            }
            onConfirm({ device: selected, id: bleDevice.id });
          } catch (e) {
            setError(
              e && e.message ? String(e.message) : 'Bluetooth setup failed.'
            );
          }
          setIsLoading(false);
        }}
      >
        Continue
      </Button>

      {error && (
        <Text mt={3} fontSize="xs" color="red.200" textAlign="center">
          {error}
        </Text>
      )}
    </Box>
  );
};

const SelectAccounts = ({ data, onConfirm }) => {
  /** Ledger defaults to account slot 0; Keystone must start empty (no ghost `0` rowKey). */
  const [selected, setSelected] = React.useState({});
  const [error, setError] = React.useState('');
  const trezorRef = React.useRef();
  const [existing, setExisting] = React.useState({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [isInit, setIsInit] = React.useState(false);
  const [needsKeystonePassword, setNeedsKeystonePassword] =
    React.useState(null);
  const [localWalletPassword, setLocalWalletPassword] = React.useState('');
  const [localWalletPasswordConfirm, setLocalWalletPasswordConfirm] =
    React.useState('');

  const isKeystone =
    data.device === HW.keystone &&
    Array.isArray(data.keystoneAccounts) &&
    data.keystoneAccounts.length > 0;

  const keystoneNewAccounts = isKeystone
    ? data.keystoneAccounts.filter((k) => !existing[k.rowKey])
    : [];

  const getExistingAccounts = async () => {
    const accounts = await getStorage(STORAGE.accounts);
    const hwAccounts = getHwAccounts(accounts, {
      device: data.device,
      id: data.id,
    });
    const existingMap = {};
    Object.keys(hwAccounts).forEach((accountIndex) => {
      if (data.device === HW.keystone) {
        const rk = keystoneImportRowKey(accountIndex);
        if (rk) existingMap[rk] = true;
      } else {
        existingMap[String(indexToHw(accountIndex).account)] = true;
      }
    });
    setExisting(existingMap);
    setIsInit(true);
  };
  React.useEffect(() => {
    getExistingAccounts();
  }, []);

  React.useEffect(() => {
    if (!isKeystone) {
      setNeedsKeystonePassword(false);
      return;
    }
    let cancelled = false;
    getStorage(STORAGE.encryptedKey).then((enc) => {
      if (!cancelled) setNeedsKeystonePassword(!enc);
    });
    return () => {
      cancelled = true;
    };
  }, [isKeystone]);

  React.useEffect(() => {
    if (!isInit || isKeystone) return;
    setSelected({ 0: true });
  }, [isInit, isKeystone]);

  React.useEffect(() => {
    if (!isInit || !isKeystone) return;
    const newOnes = data.keystoneAccounts.filter((k) => !existing[k.rowKey]);
    const next = {};
    newOnes.forEach((k) => {
      next[k.rowKey] = true;
    });
    setSelected(next);
  }, [isInit, isKeystone, data.keystoneAccounts, existing]);

  const ledgerRows = Object.keys([...Array(50)]);
  const keystoneRows = isKeystone
    ? data.keystoneAccounts.map((k) => k.rowKey)
    : [];

  const keystoneLocalPasswordOk =
    needsKeystonePassword !== true ||
    (localWalletPassword.length >= 8 &&
      localWalletPassword === localWalletPasswordConfirm);

  return (
    isInit && (
      <Box
        width="100%"
        display="flex"
        flexDirection="column"
        alignItems="center"
      >
        <Text
          className="walletTitle"
          as="h2"
          textAlign="center"
          fontWeight="bold"
          fontSize="xl"
          width="100%"
        >
          Select Accounts
        </Text>
        <Box h={6} />
        <Text
          width="90%"
          maxWidth="340px"
          textAlign="center"
          fontSize="sm"
          color="whiteAlpha.800"
        >
          {isKeystone
            ? keystoneNewAccounts.length === 0
              ? 'Every Cardano account in this sync is already in Lucem. Close this tab or run the Keystone flow again to export a different account.'
              : keystoneNewAccounts.length === 1
                ? 'Confirm adding this account. The label shows CIP-1852 path and derivation type.'
                : 'Confirm which accounts to add (at least one). Uncheck any you do not want in Lucem.'
            : 'Select the accounts you would like to import. Afterwards click Continue and follow the instructions on your device.'}
        </Text>
        <Box h={8} />

        <Box
          width="85%"
          maxW="380px"
          minH="160px"
          h="200px"
          rounded="xl"
          border="1px solid"
          borderColor={HW_ACCENT.panelBorder}
          bg="linear-gradient(180deg, rgba(36, 10, 56, 0.92) 0%, rgba(18, 8, 34, 0.94) 100%)"
          boxShadow={HW_ACCENT.panelGlow}
          sx={{ maxHeight: 'min(16.25rem, 42vh)' }}
        >
          <Scrollbars
            renderView={lucemTransparentScrollView}
            style={{
              width: '100%',
              height: '100%',
            }}
            autoHide
          >
            {(isKeystone ? keystoneRows : ledgerRows).map((rowKey) => (
              <Box
                key={rowKey}
                opacity={existing[rowKey] ? 0.7 : 1}
                width="80%"
                my={4}
                display="flex"
                alignItems="center"
              >
                <Box ml={6} fontWeight="bold" fontSize="sm" maxW="85%" color="whiteAlpha.900">
                  {isKeystone
                    ? data.keystoneAccounts.find((x) => x.rowKey === rowKey)
                        ?.name ||
                      rowKey
                    : `Account ${parseInt(rowKey, 10) + 1}${
                        rowKey === '0' ? ' - Default' : ''
                      }`}
                </Box>
                <Checkbox
                  colorScheme="purple"
                  sx={{
                    ...hwPanelCheckboxSx,
                    '.chakra-checkbox__label': { color: 'whiteAlpha.850' },
                  }}
                  isDisabled={!!existing[rowKey]}
                  isChecked={!!(selected[rowKey] && !existing[rowKey])}
                  onChange={(e) => {
                    if (isKeystone) {
                      const checked = e.target.checked;
                      const n = Object.keys(selected).filter(
                        (s) => selected[s] && !existing[s]
                      ).length;
                      if (!checked && n <= 1) return;
                    }
                    setSelected((s) => ({
                      ...s,
                      [rowKey]: e.target.checked,
                    }));
                  }}
                  ml="auto"
                />
              </Box>
            ))}
          </Scrollbars>
        </Box>
        {needsKeystonePassword === true && (
          <Box w="full" maxW="380px" mt={4}>
            <Text fontSize="sm" fontWeight="semibold" mb={1} color="whiteAlpha.900">
              Set a wallet password for this browser
            </Text>
            <Text fontSize="xs" color="whiteAlpha.600" mb={2}>
              Used to protect Lucem on this device (reset wallet, change password,
              and any normal accounts you add later). This is not your Keystone
              PIN or recovery phrase.
            </Text>
            <Stack spacing={2}>
              <Input
                type="password"
                size="sm"
                rounded="md"
                variant="filled"
                bg="rgba(4, 22, 34, 0.95)"
                color="whiteAlpha.900"
                borderWidth="1px"
                borderColor={HW_ACCENT.inputBorder}
                _placeholder={{ color: 'whiteAlpha.400' }}
                _hover={{
                  bg: 'rgba(10, 24, 10, 0.96)',
                borderColor: 'rgba(220, 27, 250, 0.55)',
                }}
                _focusVisible={{
                  borderColor: HW_PURPLE,
                  boxShadow: HW_ACCENT.inputFocusRing,
                }}
                placeholder="Password (min 8 characters)"
                value={localWalletPassword}
                onChange={(e) => setLocalWalletPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Input
                type="password"
                size="sm"
                rounded="md"
                variant="filled"
                bg="rgba(4, 22, 34, 0.95)"
                color="whiteAlpha.900"
                borderWidth="1px"
                borderColor={HW_ACCENT.inputBorder}
                _placeholder={{ color: 'whiteAlpha.400' }}
                _hover={{
                  bg: 'rgba(10, 24, 10, 0.96)',
                borderColor: 'rgba(220, 27, 250, 0.55)',
                }}
                _focusVisible={{
                  borderColor: HW_PURPLE,
                  boxShadow: HW_ACCENT.inputFocusRing,
                }}
                placeholder="Confirm password"
                value={localWalletPasswordConfirm}
                onChange={(e) => setLocalWalletPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Stack>
          </Box>
        )}
        <Button
          type="button"
          variant="unstyled"
          className="button new-wallet hw-tab-cta"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          isDisabled={
            isLoading ||
            (isKeystone
              ? keystoneNewAccounts.length === 0 ||
                Object.keys(selected).filter((s) => selected[s] && !existing[s])
                  .length < 1 ||
                needsKeystonePassword === null ||
                !keystoneLocalPasswordOk
              : Object.keys(selected).filter((s) => selected[s] && !existing[s])
                  .length <= 0)
          }
          isLoading={isLoading}
          mt={8}
          alignSelf="center"
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
              if (device === HW.keystone) {
                const validRowKeys = new Set(
                  (keystoneAccounts || []).map((k) => k.rowKey)
                );
                const rkList = accountIndexes.filter((rk) => validRowKeys.has(rk));
                if (rkList.length < 1) {
                  throw new Error('Select at least one Keystone account');
                }
                accounts = rkList.map((rk) => {
                  const k = keystoneAccounts.find((x) => x.rowKey === rk);
                  if (!k) throw new Error('Missing Keystone account key');
                  return {
                    accountIndex: `${HW.keystone}-${id}-${k.account}${keystoneAccountStorageSuffix(k.profile)}`,
                    publicKey: k.publicKey,
                    name: formatKeystoneCardanoAccountLabel(
                      k.account,
                      k.profile
                    ),
                  };
                });
              } else if (device === HW.ledger) {
                const appAda = await initHW({ device, id });
                const ledgerKeys = await appAda.getExtendedPublicKeys({
                  paths: accountIndexes.map((index) => [
                    HARDENED + 1852,
                    HARDENED + 1815,
                    HARDENED + parseInt(index, 10),
                  ]),
                });
                const idHex = Buffer.from(String(id), 'utf8').toString('hex');
                accounts = ledgerKeys.map(
                  ({ publicKeyHex, chainCodeHex }, index) => ({
                    accountIndex: `${HW.ledger}-${idHex}-${accountIndexes[index]}`,
                    publicKey: publicKeyHex + chainCodeHex,
                    name: `Ledger ${parseInt(accountIndexes[index], 10) + 1}`,
                  })
                );
              }
              if (!accounts || accounts.length === 0) {
                throw new Error('No accounts selected');
              }
              if (device === HW.keystone && needsKeystonePassword) {
                await initLocalWalletSecretIfAbsent(localWalletPassword);
              }
              await createHWAccounts(accounts);
              onConfirm();
            } catch (e) {
              console.warn(e);
              setError(
                e && e.message ? String(e.message) : 'An error occured'
              );
            } finally {
              setIsLoading(false);
            }
          }}
        >
          Continue
        </Button>
        {error && (
          <Text mt={3} fontSize="xs" color="red.200" textAlign="center">
            {error}
          </Text>
        )}
        <TrezorWidget ref={trezorRef} />
      </Box>
    )
  );
};

const SuccessAndClose = () => {
  return (
    <Box
      width="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
    >
      <Text
        className="walletTitle"
        as="h2"
        mt={6}
        fontWeight="bold"
        fontSize="xl"
        width="100%"
        textAlign="center"
      >
        Successfully added accounts!
      </Text>
      <Box h={10} />
      <Text
        width="90%"
        maxWidth="320px"
        textAlign="center"
        fontSize="sm"
        color="whiteAlpha.800"
      >
        You can now close this tab and continue with the extension.
      </Text>
      <Button
        type="button"
        variant="unstyled"
        className="button new-wallet hw-tab-cta"
        mt={8}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        onClick={() => closeCurrentTab()}
      >
        Close
      </Button>
    </Box>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.hw}`));
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
