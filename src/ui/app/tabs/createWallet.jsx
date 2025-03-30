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
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { createRoot } from 'react-dom/client';
import Main from '../../index';
import { TAB } from '../../../config/config';
import { useStoreActions } from 'easy-peasy';
import { generateMnemonic, getDefaultWordlist, validateMnemonic, wordlists } from 'bip39';
import { createWallet, mnemonicFromObject, mnemonicToObject } from '../../../api/extension';

// Use the same paths as preloaded in the HTML
const BackgroundImagePurple = '/assets/img/background-purple.webp';
const BackgroundImageCyan = '/assets/img/background-cyan.webp';
const LogoWhite = '/assets/img/bannerBlack.png';

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [colorTheme, setColorTheme] = React.useState('purple');

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const type = params.get('type');
    const length = params.get('length');

    const validLengths = [12, 15, 24];
    const seedLength = parseInt(length, 10);

    if (type === 'import') {
      if (!validLengths.includes(seedLength)) {
        // Handle invalid seed length
        navigate('/', { replace: true });
        return;
      }
      navigate('/import', { state: { seedLength, colorTheme: 'cyan' }, replace: true });
      setColorTheme('cyan');
    } else if (type === 'generate') {
      navigate('/generate', { state: { colorTheme: 'purple' }, replace: true });
      setColorTheme('purple');
    } else {
      // If 'type' is missing or invalid, redirect to the main page
      navigate('/', { replace: true });
    }
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
      justifyContent="center"
      alignItems="center"
      width="full"
      height="100vh"
      position="relative"
      opacity={0.9}
      backgroundImage={`url(${backgroundImage})`}
      backgroundSize="cover"
      backgroundPosition="center"
      backgroundRepeat="no-repeat"
    >
      <Box position="absolute" left="80px" top="80px">
        <Image draggable={false} src={LogoWhite} width="100px" />
      </Box>
      <Box
        className={`modal-glow-${colorTheme}`}
        rounded="2xl"
        shadow="md"
        display="flex"
        alignItems="center"
        flexDirection="column"
        justifyContent="center"
        width="90%"
        maxWidth="560px"
        maxHeight="925px"
        p={10}
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
      <Stack spacing={10} direction="row" alignItems="center" justifyContent="center">
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140}>
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
    <Box>
      <Text className="walletTitle" textAlign="center" fontWeight="bold" fontSize="xl">
        Verify Seed Phrase
      </Text>
      <Spacer height="10" />
      <Stack spacing={10} direction="row">
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140}>
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
    navigate('/', { replace: true });
    return null;
  }

  const { seedLength, colorTheme: stateColorTheme } = state;
  const validSeedLengths = [12, 15, 24];

  if (!validSeedLengths.includes(seedLength)) {
    navigate('/', { replace: true });
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

      <Stack spacing={10} direction="row">
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140}>
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
  const [state, setState] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const { state: navigationState = {} } = useLocation();
  const { mnemonic, flow, colorTheme: stateColorTheme } = navigationState;
  colorTheme = colorTheme || stateColorTheme || 'purple';
  const [isDone, setIsDone] = React.useState(false);
  const setRoute = useStoreActions((actions) => actions.globalModel.routeStore.setRoute);

  return isDone ? (
    <SuccessAndClose flow={flow} />
  ) : (
    <Box textAlign="center" display="flex" alignItems="center" justifyContent="center" width="100%">
      <Box width="65%">
        <Text className="walletTitle" fontWeight="bold" fontSize="lg">
          Create Account
        </Text>
        <Spacer height="10" />
        <Input
          focusBorderColor={`${colorTheme}.700`}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Enter account name"
        />
        <Spacer height="10" />

        <InputGroup size="md" width="100%">
          <Input
            focusBorderColor={`${colorTheme}.700`}
            isInvalid={state.regularPassword === false}
            pr="4.5rem"
            type={state.show ? 'text' : 'password'}
            onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
            onBlur={(e) =>
              e.target.value &&
              setState((s) => ({
                ...s,
                regularPassword: e.target.value.length >= 8,
              }))
            }
            placeholder="Enter password"
          />
          <Spacer height="10" />
          <InputRightElement width="4.5rem">
            <Button
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
        <Spacer height="2" />

        <InputGroup size="md">
          <Input
            focusBorderColor={`${colorTheme}.700`}
            isInvalid={state.matchingPassword === false}
            pr="4.5rem"
            onChange={(e) => setState((s) => ({ ...s, passwordConfirm: e.target.value }))}
            onBlur={(e) =>
              e.target.value &&
              setState((s) => ({
                ...s,
                matchingPassword: e.target.value === s.password,
              }))
            }
            type={state.show ? 'text' : 'password'}
            placeholder="Confirm password"
          />
          <InputRightElement _disabled={true} width="4.5rem">
            <Button
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
            Password doesn't match
          </Text>
        )}
        <Spacer height="10" />
        <Button
          className={`button ${flow === 'restore-wallet' ? 'import-wallet' : 'new-wallet'}`}
          isDisabled={
            !state.password ||
            state.password.length < 8 ||
            state.password !== state.passwordConfirm ||
            !state.name
          }
          isLoading={loading}
          loadingText="Creating"
          rightIcon={<ChevronRightIcon />}
          onClick={async () => {
            setLoading(true);
            // Pass the original mnemonic string to createWallet.
            await createWallet(state.name, mnemonic, state.password);
            setRoute('/wallet');
            setLoading(false);
            setIsDone(true);
          }}
        >
          Create
        </Button>
      </Box>
    </Box>
  );
};

const SuccessAndClose = ({ flow }) => {
  return (
    <>
      <Text mt={10} fontSize="xl" fontWeight="semibold" width={200} textAlign="center">
        Successfully created wallet!
      </Text>
      <Box h={10} />
      <Text>You can now close this tab and continue with the extension.</Text>
      <Box h={10} />
      <Button
        className={`button ${flow === 'restore-wallet' ? 'import-wallet' : 'new-wallet'}`}
        mt="auto"
        onClick={async () => window.close()}
      >
        Close
      </Button>
    </>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.createWallet}`));
root.render(
  <Main>
    <Router>
      <App />
    </Router>
  </Main>
);

if (module.hot) module.hot.accept();
