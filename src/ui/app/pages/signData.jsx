import React, { useMemo } from 'react';
import {
  getCurrentAccount,
  isHW,
  signData,
  signDataCIP30,
} from '../../../api/extension';
import platform from '../../../platform';
import Account from '../components/account';
import { Box, Flex, Image, Spinner, Stack, Text } from '@chakra-ui/react';
import ConfirmModal from '../components/confirmModal';
import InlineSignAction from '../components/inlineSignAction';
import Loader from '../../../api/loader';
import { DataSignError } from '../../../config/config';
import useSurfaceColors from '../hooks/useSurfaceColors';

/** Which key the dApp asked to sign with, as a human label. */
const KEY_LABELS = {
  payment: 'payment key',
  stake: 'stake key',
  unknown: 'an unrecognized key',
};

const SignData = ({ request, controller }) => {
  const ref = React.useRef();
  const [account, setAccount] = React.useState(null);
  const [payload, setPayload] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [faviconFailed, setFaviconFailed] = React.useState(false);
  const { pageBg, pageFg, mutedFg, subtleFg } = useSurfaceColors();

  const host = React.useMemo(() => {
    const raw = request?.origin || '';
    return raw.split('//')[1] || raw;
  }, [request]);
  const initial = (host || '?').charAt(0).toUpperCase();

  const getAccount = async () => {
    const currentAccount = await getCurrentAccount();
    if (isHW(currentAccount.index)) {
      setError('Hardware wallets cannot sign data yet.');
    }
    setAccount(currentAccount);
  };
  const getPayload = async () => {
    await Loader.load();
    const payload = Buffer.from(request.data.payload, 'hex').toString('utf8');
    setPayload(payload);
  };

  const signDataMsg = useMemo(
    () =>
      payload.split(/\r?\n/).map((line, index) => (
        <Text
          key={`${index}-${line}`}
          fontSize="sm"
          lineHeight="1.6"
          wordBreak="break-word"
          whiteSpace="pre-wrap"
        >
          {line}
        </Text>
      )),
    [payload]
  );

  const getAddress = async () => {
    await Loader.load();
    try {
      const baseAddr = Loader.Cardano.BaseAddress.from_address(
        Loader.Cardano.Address.from_bytes(
          Buffer.from(request.data.address, 'hex')
        )
      );
      if (!baseAddr) throw Error('Not a valid base address');
      setAddress('payment');
      return;
    } catch (e) {}
    try {
      const rewardAddr = Loader.Cardano.RewardAddress.from_address(
        Loader.Cardano.Address.from_bytes(
          Buffer.from(request.data.address, 'hex')
        )
      );
      if (!rewardAddr) throw Error('Not a valid base address');
      setAddress('stake');
      return;
    } catch (e) {}
    setAddress('unknown');
  };

  const loadData = async () => {
    await getAccount();
    await getPayload();
    await getAddress();
    setIsLoading(false);
  };

  const signPayload = (password) =>
    request.data.CIP30
      ? signDataCIP30(
          request.data.address,
          request.data.payload,
          password,
          account.index
        )
      : // deprecated soon
        signData(
          request.data.address,
          request.data.payload,
          password,
          account.index
        );

  const returnSignature = async (signedMessage) => {
    await controller.returnData({ data: signedMessage });
    window.close();
  };

  const returnSignError = async (signError) => {
    await controller.returnData({ error: signError });
    window.close();
  };

  const decline = async () => {
    await controller.returnData({ error: DataSignError.UserDeclined });
    window.close();
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const shellProps = {
    h: '100%',
    maxH: '100%',
    minH: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    position: 'relative',
    w: 'full',
    maxW: '100%',
    bg: pageBg,
    color: pageFg,
    overflow: 'hidden',
    className: 'lucem-wallet-main-column lucem-settings-shell lucem-sign-page',
  };

  if (isLoading) {
    return (
      <Box {...shellProps} alignItems="center" justifyContent="center">
        <Flex flex="1" align="center" justify="center" direction="column" gap={3}>
          <Spinner color="yellow.400" speed="0.5s" />
          <Text fontSize="sm" color={mutedFg}>
            Reading the request…
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <>
      <Box {...shellProps} data-testid="sign-data-page">
        <Account background={pageBg} shadow="none" />
        <Box
          flex="1"
          minH={0}
          overflowY="auto"
          overscrollBehavior="contain"
          w="full"
          px={{ base: 4, md: 6 }}
          py={5}
        >
          <Stack
            spacing={5}
            w="full"
            maxW={{ base: '100%', xl: 'sm' }}
            mx="auto"
            align="center"
          >
            <Flex
              data-testid="sign-data-origin"
              className="lucem-sign-origin"
              align="center"
              justify="center"
              gap={2}
              px={3}
              py={1.5}
              maxW="full"
            >
              {faviconFailed ? (
                <Flex
                  boxSize={5}
                  rounded="md"
                  align="center"
                  justify="center"
                  bg="whiteAlpha.200"
                  fontSize="xs"
                  fontWeight="bold"
                >
                  {initial}
                </Flex>
              ) : (
                <Image
                  draggable={false}
                  boxSize={5}
                  rounded="md"
                  alt=""
                  src={platform.icons.getFaviconUrl(request.origin)}
                  onError={() => setFaviconFailed(true)}
                />
              )}
              <Text
                fontSize="sm"
                fontWeight="semibold"
                isTruncated
                maxW={{ base: '180px', sm: '220px' }}
              >
                {host}
              </Text>
            </Flex>

            <Box textAlign="center">
              <Text
                data-testid="sign-data-page-title"
                fontSize="xl"
                fontWeight="bold"
                letterSpacing="tight"
              >
                Sign message
              </Text>
              <Text mt={1} fontSize="sm" color={mutedFg}>
                {host} asked you to sign this message with your{' '}
                {KEY_LABELS[address] || KEY_LABELS.unknown}. Signing proves you
                own the address — it cannot move funds.
              </Text>
            </Box>

            <Box
              data-testid="sign-data-payload"
              className="lucem-inset-surface lucem-sign-payload-scroll"
              rounded="3xl"
              w="full"
              px={5}
              py={4}
            >
              <Text
                fontSize="xs"
                fontWeight="semibold"
                letterSpacing="0.16em"
                textTransform="uppercase"
                color={subtleFg}
                mb={3}
              >
                Message
              </Text>
              <Box
                className="lucem-sign-payload-body"
                sx={{ WebkitOverflowScrolling: 'touch' }}
              >
                {payload.trim() ? (
                  signDataMsg
                ) : (
                  <Text fontSize="sm" color={mutedFg}>
                    This request has an empty message.
                  </Text>
                )}
              </Box>
            </Box>
          </Stack>
        </Box>

        <Box
          className="lucem-sign-footer"
          data-testid="sign-data-footer"
          flexShrink={0}
          w="full"
          px={{ base: 4, md: 6 }}
          pt={3}
          pb="calc(1.25rem + env(safe-area-inset-bottom, 0px))"
          borderTopWidth="1px"
          borderTopColor="whiteAlpha.100"
          bg={pageBg}
        >
          <Stack
            spacing={3}
            w="full"
            maxW={{ base: '100%', xl: 'sm' }}
            mx="auto"
            align="center"
          >
            {error ? (
              <Text
                data-testid="sign-data-error"
                fontSize="xs"
                color="red.300"
                textAlign="center"
                wordBreak="break-word"
              >
                {error}
              </Text>
            ) : null}
            <InlineSignAction
              testId="sign-data"
              label="Sign message"
              isHw={Boolean(account && isHW(account.index))}
              isDisabled={Boolean(error)}
              sign={signPayload}
              onSigned={returnSignature}
              onFailed={returnSignError}
              onHwRequest={() => ref.current.openModal(account.index)}
              onCancel={decline}
            />
          </Stack>
        </Box>
      </Box>
      <ConfirmModal
        ref={ref}
        sign={signPayload}
        onCloseBtn={() => {}}
        onConfirm={async (status, signedMessage) =>
          status === true
            ? returnSignature(signedMessage)
            : returnSignError(signedMessage)
        }
      />
    </>
  );
};

export default SignData;
