import { CheckIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Stack, Text, Image } from '@chakra-ui/react';
import React from 'react';
import { setWhitelisted } from '../../../api/extension';
import { APIError } from '../../../config/config';
import platform from '../../../platform';
import Account from '../components/account';
import useSurfaceColors from '../hooks/useSurfaceColors';

const originHost = (origin) => {
  try {
    return new URL(origin).host;
  } catch {
    return String(origin || '').replace(/^https?:\/\//, '') || 'Unknown site';
  }
};

const requestedCips = (request) => {
  const requested = Array.isArray(request?.data?.extensions)
    ? request.data.extensions
    : [];
  return requested
    .map((extension) => Number(extension?.cip))
    .filter((cip) => Number.isFinite(cip));
};

const Enable = ({ request, controller }) => {
  const { pageBg, pageFg, mutedFg, subtleFg } = useSurfaceColors();
  const [faviconFailed, setFaviconFailed] = React.useState(false);
  const host = originHost(request.origin);
  const wantsCip95 = requestedCips(request).includes(95);
  const initial = host.replace(/^www\./, '').charAt(0).toUpperCase() || '?';

  const permissions = [
    'View your balance and addresses',
    'Request approval for transactions',
  ];
  if (wantsCip95) {
    permissions.push('View governance keys (DRep and stake)');
  }

  const refuse = async () => {
    await controller.returnData({ error: APIError.Refused });
    window.close();
  };

  const grant = async () => {
    await setWhitelisted(request.origin);
    await controller.returnData({ data: true });
    window.close();
  };

  return (
    <Box
      data-testid="enable-page"
      h="100%"
      maxH="100%"
      minH={0}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      position="relative"
      w="full"
      maxW="100%"
      bg={pageBg}
      color={pageFg}
      overflow="hidden"
      className="lucem-wallet-main-column lucem-settings-shell lucem-sign-page"
    >
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
            data-testid="enable-origin"
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
            <Text fontSize="sm" fontWeight="semibold" isTruncated maxW="220px">
              {host}
            </Text>
          </Flex>
          <Box textAlign="center">
            <Text
              data-testid="enable-page-title"
              fontSize="xl"
              fontWeight="bold"
              letterSpacing="tight"
            >
              Connect to this site
            </Text>
            <Text mt={1} fontSize="sm" color={mutedFg}>
              {host} wants to connect to your Lucem account.
            </Text>
          </Box>
          <Box
            data-testid="enable-permissions"
            className="lucem-inset-surface"
            rounded="3xl"
            w="full"
            px={6}
            py={6}
          >
            <Text
              fontSize="xs"
              fontWeight="semibold"
              letterSpacing="0.16em"
              textTransform="uppercase"
              color={subtleFg}
              mb={4}
            >
              This site will be able to
            </Text>
            <Stack spacing={4}>
              {permissions.map((label) => (
                <Flex key={label} align="flex-start" gap={3}>
                  <Flex
                    mt="2px"
                    boxSize={6}
                    rounded="full"
                    align="center"
                    justify="center"
                    flexShrink={0}
                    bg="yellow.400"
                    color="gray.900"
                  >
                    <CheckIcon boxSize={2.5} />
                  </Flex>
                  <Text fontWeight="semibold" fontSize="sm" lineHeight="1.4">
                    {label}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>
          <Text fontSize="xs" color={mutedFg} textAlign="center" px={2}>
            Only connect to sites you trust. Lucem will still ask before any
            transaction is signed.
          </Text>
        </Stack>
      </Box>
      <Box
        className="lucem-sign-footer"
        data-testid="enable-footer"
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
          <Button
            data-testid="enable-connect"
            width="full"
            height="52px"
            rounded="2xl"
            colorScheme="yellow"
            bg="yellow.400"
            color="gray.900"
            fontWeight="black"
            _hover={{
              bg: 'yellow.300',
              transform: 'translateY(-1px)',
            }}
            _active={{ bg: 'yellow.500' }}
            onClick={grant}
          >
            Connect
          </Button>
          <Button
            data-testid="enable-cancel"
            variant="ghost"
            width="full"
            height="44px"
            rounded="2xl"
            color={pageFg}
            _hover={{ bg: 'whiteAlpha.100' }}
            onClick={refuse}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default Enable;
