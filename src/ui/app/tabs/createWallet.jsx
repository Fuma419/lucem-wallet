import React from 'react';
import '../../app/components/styles.css';
import {
  Box,
  Spacer,
  Stack,
  Text,
  Button,
  Checkbox,
  Input,
  InputGroup,
  InputRightElement,
  Image,
  Textarea,
} from '@chakra-ui/react';
import {
  HashRouter as Router,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { createRoot } from 'react-dom/client';
import Theme from '../../theme';
import { TAB } from '../../../config/config';
import { generateMnemonic, getDefaultWordlist, validateMnemonic, wordlists } from 'bip39';

/**
 * Local copies of api/extension helpers — avoids importing the extension module
 * (and Cardano WASM) until the user submits "Create", so MV3 pages and strict CSP
 * environments can render this flow first.
 */
function mnemonicToObject(mnemonic) {
  const mnemonicMap = {};
  mnemonic.split(' ').forEach((word, index) => {
    mnemonicMap[index + 1] = word;
  });
  return mnemonicMap;
}

function mnemonicFromObject(mnemonicMap) {
  return Object.keys(mnemonicMap).reduce(
    (acc, key) => (acc ? `${acc} ${mnemonicMap[key]}` : mnemonicMap[key]),
    ''
  );
}

/** Full-page tab layout like Main (non-popup), without StoreProvider — avoids loading api/extension until Create. */
const CreateWalletShell = ({ children }) => (
  <Box
    width="100%"
    minW="100%"
    maxW="100vw"
    minH="100vh"
    mx="auto"
    overflowX="hidden"
    overflowY="auto"
  >
    <Theme>{children}</Theme>
  </Box>
);

// Use the same paths as preloaded in the HTML
const BackgroundImagePurple = '/assets/img/background-purple.webp';
const BackgroundImageCyan = '/assets/img/background-cyan.webp';
const LogoWhite = '/assets/img/bannerBlack.png';

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [colorTheme, setColorTheme] = React.useState('purple');
  // React Router’s navigate callback identity changes when the location changes
  // (see useNavigateUnstable deps). Do not re-run URL bootstrap on that — it would
  // read ?type=generate again and replace /verify with /generate after “Next”.
  const didBootstrapFromQuery = React.useRef(false);

  // Bootstrap query lives on the real URL (…/createWalletTab.html?type=…), not the hash.
  // HashRouter only sees the hash for path matching; window.location.search is always correct.
  React.useEffect(() => {
    if (didBootstrapFromQuery.current) return;
    didBootstrapFromQuery.current = true;

    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const length = params.get('length');

    const validLengths = [12, 15, 24];
    const seedLength = parseInt(length, 10);

    if (type === 'import') {
      if (!validLengths.includes(seedLength)) {
        navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
        setColorTheme('purple');
        return;
      }
      navigate('/import', { state: { seedLength, colorTheme: 'cyan' }, replace: true });
      setColorTheme('cyan');
    } else if (type === 'generate') {
      navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
      setColorTheme('purple');
    } else {
      navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
      setColorTheme('purple');
    }
    // Intentionally []: bootstrap from URL once. Including `navigate` re-runs when the
    // route changes (unstable identity in RR’s useNavigateUnstable) and resets /verify → /generate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (location.state && location.state.colorTheme) {
      setColorTheme(location.state.colorTheme);
    } else if (location.pathname === '/import') {
      setColorTheme('cyan');
    } else if (location.pathname === '/generate') {
      setColorTheme('purple');
    }
  }, [location.pathname, location.state]);

  const backgroundImage = colorTheme === 'cyan' ? BackgroundImageCyan : BackgroundImagePurple;

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
      backgroundImage={`url(${backgroundImage})`}
      backgroundSize="cover"
      backgroundPosition="center"
      backgroundRepeat="no-repeat"
      boxSizing="border-box"
    >
      <Box
        as="header"
        width="100%"
        flexShrink={0}
        display="flex"
        justifyContent="flex-start"
        pt={{ base: 5, md: 8 }}
        pb={2}
        px={{ base: 4, md: 8 }}
      >
        <Image
          draggable={false}
          src={LogoWhite}
          width="100px"
          maxW="min(100px, 40vw)"
          objectFit="contain"
          alt=""
        />
      </Box>
      <Box
        flex="1"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        px={{ base: 4, md: 8 }}
        pb={{ base: 10, md: 12 }}
      >
        <Box
          className={`modal-glow-${colorTheme}`}
          rounded="2xl"
          shadow="md"
          display="flex"
          alignItems="stretch"
          flexDirection="column"
          justifyContent="center"
          width="100%"
          maxW="560px"
          maxH="925px"
          mx="auto"
          flexShrink={0}
          p={{ base: 6, md: 10 }}
          background="rgba(0, 0, 0, .85)"
          color="whiteAlpha.900"
          fontSize="md"
        >
          <Routes>
            <Route path="/generate" element={<GenerateSeed colorTheme={colorTheme} />} />
            <Route path="/verify" element={<VerifySeed colorTheme={colorTheme} />} />
            <Route path="/account" element={<MakeAccount colorTheme={colorTheme} />} />
            <Route path="/import" element={<ImportSeed colorTheme={colorTheme} />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
};

const GenerateSeed = ({ colorTheme }) => {
  const navigate = useNavigate();
  // Store only the mnemonic string in state
  const [mnemonicStr, setMnemonicStr] = React.useState('');
  const [checked, setChecked] = React.useState(false);

  const generate = () => {
    const mnemonic = generateMnemonic(256);
    setMnemonicStr(mnemonic);
  };

  React.useEffect(() => {
    generate();
  }, []);

  // For display only, convert to an object
  const mnemonicObj = mnemonicStr ? mnemonicToObject(mnemonicStr) : {};

  return (
    <Box>
      <Text className="walletTitle" textAlign="center" fontWeight="bold" fontSize="xl">
        New Seed Phrase
      </Text>
      <Spacer height="10" />
      <Stack
        spacing={10}
        direction="row"
        alignItems="flex-start"
        justifyContent="center"
        width="100%"
        flexWrap="wrap"
      >
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140} flexShrink={0}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              return (
                <Box key={index} marginBottom={3} display="flex" alignItems="center" justifyContent="center">
                  {!Boolean(colIndex) && (
                    <Box
                      mr={2}
                      width={6}
                      height={6}
                      fontWeight="bold"
                      fontSize="sm"
                      rounded="full"
                      borderRadius={20}
                      background={`${colorTheme}.600`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color={`${colorTheme === 'purple' ? 'cyan.100' : 'gray.900'}`}
                    >
                      {index}
                    </Box>
                  )}
                  <Input
                    id={`lucem-seed-generate-word-${index}`}
                    name={`lucemSeedGenerateWord${index}`}
                    autoComplete="off"
                    focusBorderColor={`${colorTheme}.700`}
                    width={110}
                    size="sm"
                    isReadOnly={true}
                    value={mnemonicObj ? mnemonicObj[index] : '...'}
                    textAlign="center"
                    variant="filled"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900"
                    color="whiteAlpha.900"
                    placeholder={`Word ${index}`}
                  />
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontSize="sm"
                      fontWeight="bold"
                      rounded="full"
                      borderRadius={20}
                      background={`${colorTheme}.600`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color={`${colorTheme === 'purple' ? 'cyan.100' : 'gray.900'}`}
                    >
                      {index}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Stack>
      <Box height={3} />
      <Stack alignItems="center" direction="column">
        <Stack direction="row" width="64" spacing="6">
          <Checkbox onChange={(e) => setChecked(e.target.checked)} size="lg" colorScheme={colorTheme} />
          <Text className="walletTitle" wordBreak="break-word" fontSize="sm">
            I've stored the seed phrase in a secure place.
          </Text>
        </Stack>
        <Box height="4" />
        <Button
          type="button"
          className="button new-wallet"
          isDisabled={!checked}
          rightIcon={<ChevronRightIcon />}
          onClick={() => {
            // Pass the original mnemonic string (not the object)
            navigate('/verify', { state: { mnemonic: mnemonicStr, colorTheme } });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const VerifySeed = ({ colorTheme }) => {
  const navigate = useNavigate();
  const { state: { mnemonic, colorTheme: stateColorTheme } = {} } = useLocation();
  colorTheme = colorTheme || stateColorTheme;
  // Use a separate variable for display purposes
  const displayMnemonic = typeof mnemonic === 'string' ? mnemonicToObject(mnemonic) : mnemonic;
  const [input, setInput] = React.useState({});
  const [allValid, setAllValid] = React.useState(null);
  const refs = React.useRef([]);

  const verifyAll = () => {
    if (
      input[5] === displayMnemonic[5] &&
      input[10] === displayMnemonic[10] &&
      input[15] === displayMnemonic[15] &&
      input[20] === displayMnemonic[20]
    ) {
      setAllValid(true);
    } else {
      setAllValid(false);
    }
  };

  React.useEffect(() => {
    verifyAll();
  }, [input]);

  return (
    <Box width="100%" maxW="100%">
      <Text
        className="walletTitle"
        as="h2"
        textAlign="center"
        fontWeight="bold"
        fontSize="xl"
        width="100%"
        px={0}
      >
        Verify Seed Phrase
      </Text>
      <Spacer height="10" />
      <Stack
        spacing={10}
        direction="row"
        alignItems="flex-start"
        justifyContent="center"
        width="100%"
        flexWrap="wrap"
      >
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140} flexShrink={0}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              return (
                <Box key={index} marginBottom={3} display="flex" alignItems="center" justifyContent="center">
                  {!Boolean(colIndex) && (
                    <Box
                      mr={2}
                      width={6}
                      height={6}
                      fontSize="sm"
                      fontWeight="bold"
                      rounded="full"
                      borderRadius={20}
                      background={`${colorTheme}.600`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="gray.900"
                    >
                      {index}
                    </Box>
                  )}
                  <Input
                    id={`lucem-seed-verify-word-${index}`}
                    name={`lucemSeedVerifyWord${index}`}
                    autoComplete="off"
                    variant={index % 5 !== 0 ? 'filled' : 'outline'}
                    defaultValue={index % 5 !== 0 ? displayMnemonic[index] : ''}
                    isReadOnly={index % 5 !== 0}
                    focusBorderColor={`${colorTheme}.700`}
                    width={110}
                    size="sm"
                    isInvalid={input[index] && input[index] !== displayMnemonic[index]}
                    ref={(el) => (refs.current[index] = el)}
                    onChange={(e) => {
                      setInput((i) => ({
                        ...i,
                        [index]: e.target.value,
                      }));
                      const next = refs.current[index + 1];
                      if (next && e.target.value === displayMnemonic[index]) {
                        refs.current[index].blur();
                      }
                    }}
                    textAlign="center"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900"
                    placeholder={`Word ${index}`}
                  />
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontSize="sm"
                      fontWeight="bold"
                      rounded="full"
                      background={`${colorTheme}.700`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="gray.900"
                    >
                      {index}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Stack>
      <Spacer height="6" />
      <Stack alignItems="center" justifyContent="center" direction="row">
        <Button
          type="button"
          fontWeight="medium"
          className="button"
          onClick={() => {
            // Pass the original mnemonic string for account creation
            navigate('/account', {
              state: { mnemonic, flow: 'create-wallet', colorTheme },
            });
          }}
        >
          Skip
        </Button>
        <Button
          type="button"
          ml="3"
          className="button new-wallet"
          isDisabled={!allValid}
          rightIcon={<ChevronRightIcon />}
          onClick={() => {
            navigate('/account', {
              state: { mnemonic, flow: 'create-wallet', colorTheme },
            });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const ImportSeed = ({ colorTheme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = location;

  if (!state || !state.seedLength) {
    navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
    return null;
  }

  const { seedLength, colorTheme: stateColorTheme } = state;
  const validSeedLengths = [12, 15, 24];

  if (!validSeedLengths.includes(seedLength)) {
    navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
    return null;
  }

  colorTheme = colorTheme || stateColorTheme;
  const [input, setInput] = React.useState({});
  const [fullSeedPhrase, setFullSeedPhrase] = React.useState('');
  const [allValid, setAllValid] = React.useState(null);
  const refs = React.useRef([]);
  const words = wordlists[getDefaultWordlist()];

  React.useEffect(() => {
    const hasFullPhrase = fullSeedPhrase.trim().length > 0;
    const hasWordInputs = Object.keys(input).length > 0;
  
    if (hasFullPhrase) {
      const cleanedPhrase = fullSeedPhrase.trim().toLowerCase();
      const wordsArray = cleanedPhrase.split(/\s+/);
      if (wordsArray.length === seedLength && validateMnemonic(cleanedPhrase)) {
        setAllValid(true);
      } else {
        setAllValid(false);
      }
    } else if (hasWordInputs) {
      if (Object.keys(input).length === seedLength && validateMnemonic(mnemonicFromObject(input))) {
        setAllValid(true);
      } else {
        setAllValid(false);
      }
    } else {
      setAllValid(null);
    }
  }, [input, fullSeedPhrase]);

  return (
    <Box>
      <Text className="walletTitle" textAlign="center" fontWeight="bold" fontSize="xl">
        Import Seed Phrase
      </Text>
      <Spacer height="5" />
      <Text className="walletTitle" fontSize="sm" textAlign="center">
        Enter a {seedLength}-word seed phrase.
      </Text>
      <Spacer height="5" />

      <Stack
        spacing={10}
        direction="row"
        alignItems="flex-start"
        justifyContent="center"
        width="100%"
        flexWrap="wrap"
      >
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140} flexShrink={0}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              if (index > seedLength) return null;
              return (
                <Box key={index} marginBottom={3} display="flex" alignItems="center" justifyContent="center">
                  {!Boolean(colIndex) && (
                    <Box
                      mr={2}
                      width={6}
                      height={6}
                      fontSize="sm"
                      fontWeight="bold"
                      rounded="full"
                      background={`${colorTheme}.700`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="gray.900"
                    >
                      {index}
                    </Box>
                  )}
                  <Input
                    id={`lucem-seed-import-word-${index}`}
                    name={`lucemSeedImportWord${index}`}
                    autoComplete="off"
                    variant="filled"
                    width={110}
                    focusBorderColor={`${colorTheme}.700`}
                    size="sm"
                    isInvalid={input[index] && !words.includes(input[index])}
                    ref={(el) => (refs.current[index] = el)}
                    onChange={(e) => {
                      setInput((i) => ({
                        ...i,
                        [index]: e.target.value.trim().toLowerCase(),
                      }));
                    }}
                    textAlign="center"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900"
                    placeholder={`Word ${index}`}
                  />
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontSize="sm"
                      fontWeight="bold"
                      rounded="full"
                      background={`${colorTheme}.700`}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="gray.900"
                    >
                      {index}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Stack>

      <Spacer height="5" />

      <Textarea
        id="lucem-seed-import-paste"
        name="lucemSeedImportPaste"
        autoComplete="off"
        placeholder={`Or paste your ${seedLength}-word seed phrase here`}
        size="sm"
        focusBorderColor={`${colorTheme}.700`}
        background="gray.900"
        color="whiteAlpha.900"
        value={fullSeedPhrase}
        borderRadius={20}
        resize="none"
        onChange={(e) => setFullSeedPhrase(e.target.value)}
      />

      <Spacer height="2" />

      {allValid === false && (
        <Text color="red.300" className="walletTitle" fontSize="sm" textAlign="center">
          Invalid seed phrase. Please check and try again.
        </Text>
      )}

      <Spacer height="2" />

      <Stack alignItems="center" direction="column">
        <Button
          type="button"
          isDisabled={!allValid}
          className="button import-wallet"
          rightIcon={<ChevronRightIcon />}
          onClick={() => {
            const hasFullPhrase = fullSeedPhrase.trim().length > 0;
            const mnemonic = hasFullPhrase
              ? fullSeedPhrase.trim().toLowerCase()
              : mnemonicFromObject(input);

            navigate('/account', {
              state: { mnemonic, flow: 'restore-wallet', colorTheme },
            });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const MakeAccount = ({ colorTheme }) => {
  /** Uncontrolled password inputs so Safari / iOS Keychain autofill is not wiped by React controlled values. */
  const passwordRef = React.useRef(null);
  const confirmRef = React.useRef(null);
  const [, bumpForm] = React.useReducer((n) => n + 1, 0);
  const prevPwCfRef = React.useRef({ pw: '', cf: '' });

  const [state, setState] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const { state: navigationState = {} } = useLocation();
  const { mnemonic, flow, colorTheme: stateColorTheme } = navigationState;
  colorTheme = colorTheme || stateColorTheme || 'purple';
  const [isDone, setIsDone] = React.useState(false);

  const readPasswords = React.useCallback(() => {
    const pw = passwordRef.current?.value ?? '';
    const cf = confirmRef.current?.value ?? '';
    return { pw, cf };
  }, []);

  /** Password managers may not fire React events; re-render when DOM values change so Create enables. */
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const pw = passwordRef.current?.value ?? '';
      const cf = confirmRef.current?.value ?? '';
      const prev = prevPwCfRef.current;
      if (pw !== prev.pw || cf !== prev.cf) {
        prevPwCfRef.current = { pw, cf };
        bumpForm();
      }
    }, 300);
    const stop = window.setTimeout(() => clearInterval(id), 12000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, []);

  const { pw, cf } = readPasswords();
  const canSubmit =
    Boolean(state.name && pw.length >= 8 && pw === cf);

  const submitCreate = async () => {
    const { pw: p, cf: c } = readPasswords();
    setLoading(true);
    setError(null);
    try {
      if (!state.name || p.length < 8 || p !== c) {
        setError('Please enter a matching password (8+ characters).');
        setLoading(false);
        return;
      }
      const { createWallet: createWalletApi } = await import(
        '../../../api/extension'
      );
      await createWalletApi(state.name, mnemonic, p);
      setIsDone(true);
    } catch (e) {
      console.error('Wallet creation failed:', e);
      const msg = e && e.message ? String(e.message) : '';
      if (
        e &&
        (e.name === 'EvalError' ||
          msg.includes('Content Security Policy') ||
          msg.includes('unsafe-eval'))
      ) {
        setError(
          'This page cannot run wallet crypto (browser CSP). Create the wallet from the PWA at http://localhost…/mainPopup.html or your deployed site, not from a chrome-extension:// tab.'
        );
      } else {
        setError(msg || 'Failed to create wallet. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return isDone ? (
    <SuccessAndClose flow={flow} />
  ) : (
    <Box textAlign="center" display="flex" alignItems="center" justifyContent="center" width="100%">
      <Box width="100%" maxW="400px" mx="auto">
        <Text className="walletTitle" fontWeight="bold" fontSize="lg">
          Create Account
        </Text>
        <Spacer height="10" />
        <Box
          as="form"
          autoComplete="on"
          width="100%"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <Input
            id="lucem-account-name"
            name="username"
            autoComplete="username"
            variant="filled"
            bg="gray.900"
            color="whiteAlpha.900"
            _placeholder={{ color: 'whiteAlpha.500' }}
            focusBorderColor={`${colorTheme}.700`}
            onChange={(e) => {
              setState((s) => ({ ...s, name: e.target.value }));
              setError(null);
            }}
            placeholder="Enter account name"
          />
          <Spacer height="10" />

          <InputGroup size="md" width="100%">
            <Input
              ref={passwordRef}
              id="lucem-account-password"
              name="new-password"
              variant="filled"
              bg="gray.900"
              color="whiteAlpha.900"
              _placeholder={{ color: 'whiteAlpha.500' }}
              focusBorderColor={`${colorTheme}.700`}
              isInvalid={state.regularPassword === false}
              pr="4.5rem"
              type={state.show ? 'text' : 'password'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="new-password"
              defaultValue=""
              onChange={bumpForm}
              onInput={bumpForm}
              onBlur={(e) => {
                bumpForm();
                const v = e.target.value;
                if (v) {
                  setState((s) => ({
                    ...s,
                    regularPassword: v.length >= 8,
                  }));
                }
              }}
              placeholder="New password"
            />
            <InputRightElement width="4.5rem">
              <Button
                type="button"
                h="1.75rem"
                size="sm"
                onClick={() => setState((s) => ({ ...s, show: !s.show }))}
                colorScheme={colorTheme}
              >
                {state.show ? 'Hide' : 'Show'}
              </Button>
            </InputRightElement>
          </InputGroup>
          {state.regularPassword === false && (
            <Text fontSize="sm" color="red.300">
              Password must be at least 8 characters long
            </Text>
          )}
          <Spacer height="10" />

          <InputGroup size="md" width="100%">
            <Input
              ref={confirmRef}
              id="lucem-account-password-confirm"
              name="confirm-new-password"
              variant="filled"
              bg="gray.900"
              color="whiteAlpha.900"
              _placeholder={{ color: 'whiteAlpha.500' }}
              focusBorderColor={`${colorTheme}.700`}
              isInvalid={state.matchingPassword === false}
              pr="4.5rem"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="new-password"
              defaultValue=""
              onChange={bumpForm}
              onInput={bumpForm}
              onBlur={(e) => {
                bumpForm();
                const v = e.target.value;
                const p = passwordRef.current?.value ?? '';
                setState((s) => ({
                  ...s,
                  matchingPassword: v ? v === p : undefined,
                }));
              }}
              type={state.show ? 'text' : 'password'}
              placeholder="Confirm new password"
            />
            <InputRightElement width="4.5rem">
              <Button
                type="button"
                h="1.75rem"
                size="sm"
                onClick={() => setState((s) => ({ ...s, show: !s.show }))}
                colorScheme={colorTheme}
              >
                {state.show ? 'Hide' : 'Show'}
              </Button>
            </InputRightElement>
          </InputGroup>
          {state.matchingPassword === false && (
            <Text fontSize="sm" color="red.300">
              Password doesn&apos;t match
            </Text>
          )}
          <Spacer height="4" />

          {error && (
            <Text fontSize="sm" color="red.300" mb={4}>
              {error}
            </Text>
          )}

          <Button
            type="submit"
            className={`button ${flow === 'restore-wallet' ? 'import-wallet' : 'new-wallet'}`}
            isDisabled={!canSubmit}
            isLoading={loading}
            loadingText="Creating"
            rightIcon={<ChevronRightIcon />}
          >
            Create
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

const isExtension =
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime !== 'undefined' &&
  typeof chrome.runtime.id !== 'undefined';

const SuccessAndClose = ({ flow }) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      textAlign="center"
      width="100%"
      maxW="400px"
      mx="auto"
    >
      <Text mt={10} fontSize="xl" fontWeight="semibold" maxW="100%" px={2}>
        Successfully created wallet!
      </Text>
      <Box h={10} />
      <Text px={2}>
        {isExtension
          ? 'You can now close this tab and continue with the extension.'
          : 'Redirecting to your wallet...'}
      </Text>
      <Box h={10} />
      <Button
        type="button"
        className={`button ${flow === 'restore-wallet' ? 'import-wallet' : 'new-wallet'}`}
        mt="auto"
        onClick={async () => {
          if (isExtension) {
            window.close();
          } else {
            // Load the main bundle at /wallet so the URL matches the in-app route (matches Vercel rewrites).
            window.location.assign(`${window.location.origin}/wallet`);
          }
        }}
      >
        {isExtension ? 'Close' : 'Open Wallet'}
      </Button>
    </Box>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.createWallet}`));
root.render(
  <CreateWalletShell>
    <Router>
      <App />
    </Router>
  </CreateWalletShell>
);

if (module.hot) module.hot.accept();
