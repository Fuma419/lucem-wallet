import React from 'react';
import '../../app/components/styles.css';
import {
  createWallet,
  mnemonicFromObject,
  mnemonicToObject,
} from '../../../api/extension';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from 'react-router-dom';
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
} from '@chakra-ui/react';
import {
  generateMnemonic,
  getDefaultWordlist,
  validateMnemonic,
  wordlists,
} from 'bip39';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { createRoot } from 'react-dom/client';
import { AnalyticsProvider } from '../../../features/analytics/provider';
import { EventTracker } from '../../../features/analytics/event-tracker';
import { ExtensionViews } from '../../../features/analytics/types';
import Main from '../../index';
import { TAB } from '../../../config/config';
import BackgroundImagePurple from '../../../assets/img/background-purple';
import BackgroundImageCyan from '../../../assets/img/background-cyan';
import BackgroundImageGreen from '../../../assets/img/background-green';
import LogoWhite from '../../../assets/img/bannerBlack'; // Use the white logo directly for dark mode
import { useStoreActions } from 'easy-peasy';
import { useCaptureEvent } from '../../../features/analytics/hooks';
import { Events } from '../../../features/analytics/events';

const App = () => {

  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const length = params.get('length');
    if (type === 'import')
      navigate('/import', { state: { seedLength: parseInt(length) } });
    else navigate('/generate');
  }, []);

  // Conditionally setting the background image based on the current route
  const backgroundImage = location.pathname === '/import' ? BackgroundImageCyan : BackgroundImagePurple;
  const colorTheme = location.pathname === '/import' ? 'cyan' : 'purple';

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      width="full"
      height="100vh"
      position="relative"
      opacity={.9}
      backgroundImage={`url(${backgroundImage})`}
      backgroundSize="cover"
      backgroundPosition="center"
      backgroundRepeat="no-repeat"
    >
      {/* Logo */}
      <Box position="absolute" left="80px" top="80px">
        <Image draggable={false} src={LogoWhite} width="100px" />
      </Box>
      {/* Content */}
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
        maxHeight="850px"
        p={10}
        background="rgba(0, 0, 0, .85)"  // Optional: Add a semi-transparent background to improve text visibility
        color="whiteAlpha.900"
        fontSize="md"
      >
        <Routes>
          <Route path="/generate" element={<GenerateSeed />} />
          <Route path="/verify" element={<VerifySeed />} />
          <Route path="/account" element={<MakeAccount />} />
          <Route path="/import" element={<ImportSeed />} />
        </Routes>
      </Box>
    </Box>
  );
};


const GenerateSeed = () => {
  const capture = useCaptureEvent();
  const navigate = useNavigate();
  const [mnemonic, setMnemonic] = React.useState({});
  const generate = () => {
    const mnemonic = generateMnemonic(256);
    const mnemonicMap = mnemonicToObject(mnemonic);
    setMnemonic(mnemonicMap);
  };
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    generate();
  }, []);
  const colorTheme = location.pathname === '/import' ? 'cyan' : 'purple';

  return (
    <Box>
      <Text className='walletTitle' textAlign="center" fontWeight="bold" fontSize="xl">
        New Seed Phrase
      </Text>
      <Spacer height="10" />
      <Stack
        spacing={10}
        direction="row"
        alignItems="center"
        justifyContent="center"
      >
        {[0, 1].map((colIndex) => (
          <Box  key={colIndex} width={140}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              return (
                <Box
                  key={index}
                  marginBottom={3}
                  display="flex"
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  {!Boolean(colIndex) && (
                    <Box
                      mr={2}
                      width={6}
                      height={6}
                      fontWeight="bold"
                      fontSize={'sm'}
                      rounded="full"
                      borderRadius={20}
                      background={'purple.600'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'cyan.100'} // Dark text on  background
                    >
                      {index}
                    </Box>
                  )}
                  <Input 
                    focusBorderColor={`${colorTheme}.300`}
                    width={110}
                    size={'sm'}
                    isReadOnly={true}
                    value={mnemonic ? mnemonic[index] : '...'}
                    textAlign="center"
                    variant="filled"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900" // Dark input background
                    color="whiteAlpha.900" // White input text color
                    placeholder={`Word ${index}`}
                  ></Input>
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontSize={'sm'}
                      fontWeight="bold"
                      rounded="full"
                      borderRadius={20}
                      background={'purple.600'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'cyan.100'} // Dark text on cyan background
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
          <Checkbox onChange={(e) => setChecked(e.target.checked)} size="lg" colorScheme="purple"/>
          <Text className='walletTitle' wordBreak="break-word" fontSize="sm">
            I've stored the seed phrase in a secure place.
          </Text>
        </Stack>
        <Box height={4} />
        <Button className="button new-wallet"
          isDisabled={!checked}
          rightIcon={<ChevronRightIcon />}
          colorScheme="purple"
          onClick={() => {
            capture(Events.OnboardingCreateWritePassphraseNextClick);
            navigate('/verify', { state: { mnemonic } });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const VerifySeed = () => {
  const capture = useCaptureEvent();
  const navigate = useNavigate();
  const { state: { mnemonic } = {} } = useLocation();
  const [input, setInput] = React.useState({});
  const [allValid, setAllValid] = React.useState(false);
  const refs = React.useRef([]);

  const verifyAll = () => {
    if (
      input[5] == mnemonic[5] &&
      input[10] == mnemonic[10] &&
      input[15] == mnemonic[15] &&
      input[20] == mnemonic[20]
    )
      setAllValid(true);
    else setAllValid(false);
  };

  React.useEffect(() => {
    verifyAll();
  }, [input]);

  const colorTheme = location.pathname === '/import' ? 'cyan' : 'purple';

  return (
    <Box>
      <Text className='walletTitle' textAlign="center" fontWeight="bold" fontSize="xl">
        Verify Seed Phrase
      </Text>
      {/* <Spacer height="10" />
      <Text fontSize="xs" textAlign="center">
        Enter the seed phrase you've just stored.
      </Text> */}
      <Spacer height="10" />
      <Stack spacing={10} direction="row">
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              return (
                <Box
                  key={index}
                  marginBottom={3}
                  display="flex"
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  {!Boolean(colIndex) && (
                    <Box
                    mr={2}
                    width={6}
                    height={6}
                    fontSize={'sm'}
                    fontWeight="bold"
                    rounded="full"
                    borderRadius={20}
                    background={'purple.600'}
                    display={'flex'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    color={'gray.900'} // Dark text on gray background
                    >
                      {index}
                    </Box>
                  )}
                  <Input
                    variant={index % 5 !== 0 ? 'filled' : 'outline'}
                    defaultValue={index % 5 !== 0 ? mnemonic[index] : ''}
                    isReadOnly={index % 5 !== 0}
                    focusBorderColor={`${colorTheme}.300`}
                    width={110}
                    size={'sm'}
                    isInvalid={input[index] && input[index] !== mnemonic[index]}
                    ref={(el) => (refs.current[index] = el)}
                    onChange={(e) => {
                      setInput((i) => ({
                        ...i,
                        [index]: e.target.value,
                      }));
                      const next = refs.current[index + 1];
                      if (next && e.target.value === mnemonic[index]) {
                        refs.current[index].blur();
                      }
                    }}
                    textAlign="center"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900" // Dark input background
                    placeholder={`Word ${index}`}
                  ></Input>
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontsize={'sm'}
                      fontWeight="bold"
                      rounded="full"
                      background={'purple.500'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'gray.900'}
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
            capture(Events.OnboardingCreateEnterPassphraseSkipClick);
            navigate('/account', {
              state: { mnemonic, flow: 'create-wallet' },
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
            capture(Events.OnboardingCreateEnterPassphraseNextClick);
            navigate('/account', {
              state: { mnemonic, flow: 'create-wallet' },
            });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const ImportSeed = () => {
  const capture = useCaptureEvent();
  const navigate = useNavigate();
  const { state: { seedLength } = {} } = useLocation();
  const [input, setInput] = React.useState({});
  const [allValid, setAllValid] = React.useState(false);
  const refs = React.useRef([]);
  const words = wordlists[getDefaultWordlist()];

  const verifyAll = () => {
    if (
      Object.keys(input).length == seedLength &&
      validateMnemonic(mnemonicFromObject(input))
    )
      setAllValid(true);
    else setAllValid(false);
  };

  React.useEffect(() => { 
    verifyAll();
  }, [input]);

  const colorTheme = location.pathname === '/import' ? 'cyan' : 'purple';

  return (
    <Box>
      <Text className='walletTitle' textAlign="center" fontWeight="bold" fontSize="xl">
        Import Seed Phrase
      </Text>
      <Spacer height="5" />
      <Text className='walletTitle' fontSize="sm" textAlign="center">
        Enter a {seedLength}-word seed phrase.
      </Text>
      <Spacer height="10" />
      <Stack spacing={10} direction="row">
        {[0, 1].map((colIndex) => (
          <Box key={colIndex} width={140}>
            {[...Array(12)].map((_, rowIndex) => {
              const index = colIndex * 12 + rowIndex + 1;
              if (index > seedLength) return;
              return (
                <Box
                  key={index}
                  marginBottom={3}
                  display="flex"
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  {!Boolean(colIndex) && (
                    <Box
                      mr={2}
                      width={6}
                      height={6}
                      fontSize={'sm'}
                      fontWeight="bold"
                      rounded="full"
                      background={'cyan.500'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'gray.900'}
                    >
                      {index}
                    </Box>
                  )}
                  <Input
                    variant={'filled'}
                    width={110}
                    focusBorderColor={`${colorTheme}.300`}
                    size={'sm'}
                    isInvalid={input[index] && !words.includes(input[index])}
                    ref={(el) => (refs.current[index] = el)}
                    onChange={(e) => {
                      setInput((i) => ({
                        ...i,
                        [index]: e.target.value,
                      }));
                    }}
                    textAlign="center"
                    fontWeight="bold"
                    rounded="full"
                    background="gray.900" // Dark input background

                    placeholder={`Word ${index}`}
                  ></Input>
                  {Boolean(colIndex) && (
                    <Box
                      ml={2}
                      width={6}
                      height={6}
                      fontSize={'sm'}
                      fontWeight="bold"
                      rounded="full"
                      background={'cyan.500'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      color={'gray.900'}
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
      <Spacer height="1" />
      <Spacer height="5" />
      <Stack alignItems="center" direction="column">
        <Button
          isDisabled={!allValid}
          rightIcon={<ChevronRightIcon />}
          onClick={() => {
            capture(Events.OnboardingRestoreEnterPassphraseNextClick);
            navigate('/account', {
              state: { mnemonic: input, flow: 'restore-wallet' },
            });
          }}
        >
          Next
        </Button>
      </Stack>
    </Box>
  );
};

const MakeAccount = (props) => {
  const capture = useCaptureEvent();
  const [state, setState] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const { state: { mnemonic, flow } = {} } = useLocation();
  const [isDone, setIsDone] = React.useState(false);
  const setRoute = useStoreActions(
    (actions) => actions.globalModel.routeStore.setRoute
  );

  return isDone ? (
    <SuccessAndClose />
  ) : (
    <Box
      textAlign="center"
      display="flex"
      alignItems="center"
      justifyContent="center"
      width="100%"
    >
      <Box width="65%">
        <Text className='walletTitle' fontWeight="bold" fontSize="lg">
          Create Account
        </Text>
        <Spacer height="10" />
        <Input
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Enter account name"
        ></Input>
        <Spacer height="10" />

        <InputGroup size="md" width="100%">
          <Input
            isInvalid={state.regularPassword === false}
            pr="4.5rem"
            type={state.show ? 'text' : 'password'}
            onChange={(e) =>
              setState((s) => ({ ...s, password: e.target.value }))
            }
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
            >
              {state.show ? 'Hide' : 'Show'}
            </Button>
          </InputRightElement>
        </InputGroup>
        {state.regularPassword === false && (
          <Text fontsize={'sm'} color="red.300">
            Password must be at least 8 characters long
          </Text>
        )}
        <Spacer height="2" />

        <InputGroup size="md">
          <Input
            isInvalid={state.matchingPassword === false}
            pr="4.5rem"
            onChange={(e) =>
              setState((s) => ({ ...s, passwordConfirm: e.target.value }))
            }
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
            >
              {state.show ? 'Hide' : 'Show'}
            </Button>
          </InputRightElement>
        </InputGroup>
        {state.matchingPassword === false && (
          <Text fontsize={'sm'} color="red.300">
            Password doesn't match
          </Text>
        )}
        <Spacer height="10" />
        <Button className="button new-wallet"
          isDisabled={
            !state.password ||
            !state.password.length >= 8 ||
            state.password !== state.passwordConfirm ||
            !state.name
          }
          isLoading={loading}
          loadingText="Creating"
          rightIcon={<ChevronRightIcon />}
          onClick={async () => {
            capture(
              flow === 'create-wallet'
                ? Events.OnboardingCreateWalletNamePasswordNextClick
                : Events.OnboardingRestoreWalletNamePasswordNextClick
            );
            setLoading(true);
            await createWallet(
              state.name,
              mnemonicFromObject(mnemonic),
              state.password
            );
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

const SuccessAndClose = () => {
  return (
    <>
      <Text
        mt={10}
        fontSize="xl"
        fontWeight="semibold"
        width={200}
        textAlign="center"
      >
        Successfully created wallet!
      </Text>
      <Box h={10} />
      <Text>You can now close this tab and continue with the extension.</Text>
      <Box h={10} />
      <Button className="button new-wallet" mt="auto" onClick={async () => window.close()}>
        Close
      </Button>
    </>
  );
};

const root = createRoot(window.document.querySelector(`#${TAB.createWallet}`));
root.render(
  <AnalyticsProvider view={ExtensionViews.Extended}>
    <EventTracker />
    <Main>
      <Router>
        <App />
      </Router>
    </Main>
  </AnalyticsProvider>
);

if (module.hot) module.hot.accept();
