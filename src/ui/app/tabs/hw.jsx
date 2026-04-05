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
  Select,
  Collapse,
  Radio,
  RadioGroup,
  Stack,
  Input,
} from '@chakra-ui/react';
import { Scrollbars } from '../components/scrollbar';
import { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';


// assets
import LogoOriginal from '../../../assets/img/logo.svg';
import LogoWhite from '../../../assets/img/bannerBlack.png';
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
import { MdUsb } from 'react-icons/md';
import { Planet } from 'react-kawaii';
import { ledgerUSBVendorId } from '@ledgerhq/devices';

const VENDOR_IDS = {
  ledger: [ledgerUSBVendorId],
  trezor: [0x534c, 0x1209], // Model T HID 0x534c and others 0x1209 - taken from https://github.com/vacuumlabs/trezor-suite/blob/develop/packages/transport/src/constants.ts#L13-L21
  keystone: 'keystone',
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
          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            overflowX="hidden"
            pb={3}
            sx={{ WebkitOverflowScrolling: 'touch' }}
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
  const { colorMode } = useColorMode();
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
      <>
        <Text fontSize="x-large" fontWeight="semibold">
          Step 1 — Keystone scans Lucem
        </Text>
        <Box h={4} />
        <Text fontSize="sm" maxW="340px">
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
        <Text fontSize="sm" maxW="340px" color="gray.600">
          When Keystone shows its animated sync QR, tap Continue here and allow
          the webcam to scan it. To add another account later, open this flow
          again after choosing a different account on the device.
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
          onClick={() => {
            keystoneScanConsumedRef.current = false;
            setKeystoneStep('pick');
          }}
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
          <Text fontSize="xs" color="red.300" mt={2}>
            {scanError}
          </Text>
        )}
        <Button
          mt={4}
          variant="ghost"
          onClick={() => {
            setScanError('');
            keystoneScanConsumedRef.current = false;
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
            keystoneScanConsumedRef.current = false;
            setKeystoneAccountChecks(defaultKeystoneAccountChecks());
            setKeystoneDerivation('standard');
            setKeystoneAdvancedOpen(false);
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
        <>
          <Text width="340px" fontSize="sm">
            By default Lucem connects <b>account 0</b> using{' '}
            <b>Cardano standard</b> derivation (CIP-1852). Open{' '}
            <b>Advanced options</b> to request more accounts (at least one) or
            Ledger-compatible keys — settings must match Keystone when you approve the
            QR.
          </Text>
          <Box h={4} />
          <Button
            variant="ghost"
            size="sm"
            alignSelf="flex-start"
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
          <Collapse in={keystoneAdvancedOpen} animateOpacity>
            <Box
              mt={3}
              pl={1}
              borderLeftWidth="2px"
              borderColor="cyan.400"
              py={1}
            >
              <Text fontSize="sm" fontWeight="semibold">
                Accounts to request (at least one)
              </Text>
              <Text fontSize="xs" color="gray.500" mt={1} maxW="340px">
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
              <Text fontSize="sm" fontWeight="semibold" mt={4}>
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
                <Stack spacing={2}>
                  <Radio value="standard" size="sm">
                    Cardano standard (default)
                  </Radio>
                  <Radio value="ledger" size="sm">
                    Ledger-compatible (Ledger / BitBox)
                  </Radio>
                </Stack>
              </RadioGroup>
              <Text fontSize="xs" color="gray.500" mt={2} maxW="340px">
                Must match the address type you export on Keystone (Ledger vs
                standard use different keys at the same path). If a scan error says
                the QR does not match your choice, switch this option to the other
                type or re-export on the device so the QR tags match.
              </Text>
            </Box>
          </Collapse>
        </>
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
        mt={8}
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
      <>
        <Text fontSize="x-large" fontWeight="semibold">
          Select Accounts
        </Text>
        <Box h={6} />
        <Text width="300px">
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
            {(isKeystone ? keystoneRows : ledgerRows).map((rowKey) => (
              <Box
                key={rowKey}
                opacity={existing[rowKey] ? 0.7 : 1}
                width="80%"
                my={4}
                display="flex"
                alignItems="center"
              >
                <Box ml={6} fontWeight="bold" fontSize="sm" maxW="85%">
                  {isKeystone
                    ? data.keystoneAccounts.find((x) => x.rowKey === rowKey)
                        ?.name ||
                      rowKey
                    : `Account ${parseInt(rowKey, 10) + 1}${
                        rowKey === '0' ? ' - Default' : ''
                      }`}
                </Box>
                <Checkbox
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
          <Box w="full" mt={4}>
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              Set a wallet password for this browser
            </Text>
            <Text fontSize="xs" color="gray.500" mb={2}>
              Used to protect Lucem on this device (reset wallet, change password,
              and any normal accounts you add later). This is not your Keystone
              PIN or recovery phrase.
            </Text>
            <Stack spacing={2}>
              <Input
                type="password"
                size="sm"
                rounded="md"
                placeholder="Password (min 8 characters)"
                value={localWalletPassword}
                onChange={(e) => setLocalWalletPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Input
                type="password"
                size="sm"
                rounded="md"
                placeholder="Confirm password"
                value={localWalletPasswordConfirm}
                onChange={(e) => setLocalWalletPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Stack>
          </Box>
        )}
        <Button
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
                accounts = ledgerKeys.map(
                  ({ publicKeyHex, chainCodeHex }, index) => ({
                    accountIndex: `${HW.ledger}-${id}-${accountIndexes[index]}`,
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
      <Button mt={8} onClick={() => closeCurrentTab()}>
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
