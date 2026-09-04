import { Box, Button, Flex, Text, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import {
  describeProviderHealth,
  getProviderHealth,
} from '../../../api/provider-health';
import { probeChainProviders } from '../../../api/util';
import { useSettingsChrome } from './settingsChrome';

const PROVIDER_LABELS = {
  blockfrost: 'Blockfrost',
  koios: 'Koios',
};

/**
 * Chain reads prefer Blockfrost and fall back to Koios, so an outage on one
 * provider is otherwise invisible. Show both, and let the user probe on demand
 * rather than waiting for wallet traffic to reveal a fault.
 */
export default function ProviderStatus({ networkId }) {
  const { rowDivider } = useSettingsChrome();
  const okColor = useColorModeValue('green.600', 'green.300');
  const failColor = useColorModeValue('red.600', 'red.300');
  const idleColor = useColorModeValue('gray.500', 'whiteAlpha.600');
  const mutedFg = useColorModeValue('gray.600', 'whiteAlpha.700');

  const [health, setHealth] = React.useState(() => getProviderHealth());
  const [testing, setTesting] = React.useState(false);

  // Recheck on mount and whenever the network changes: a verdict recorded for
  // the previous network says nothing about this one.
  React.useEffect(() => {
    let cancelled = false;
    setTesting(true);
    probeChainProviders()
      .then((next) => {
        if (!cancelled) setHealth(next);
      })
      .catch(() => {
        if (!cancelled) setHealth(getProviderHealth());
      })
      .finally(() => {
        if (!cancelled) setTesting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [networkId]);

  const dotColor = (state) => {
    if (state === 'ok') return okColor;
    if (state === 'failing') return failColor;
    return idleColor;
  };

  const summary = {
    ok: 'Both providers reachable.',
    degraded: 'One provider is down; Lucem is using the other.',
    down: 'No provider is reachable. Balances and sending will fail.',
    unknown: 'Connection not checked yet.',
  }[health.overall];

  return (
    <Box data-testid="settings-provider-status" mt={4}>
      <Flex align="center" justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="semibold">
          Connection
        </Text>
        <Button
          size="xs"
          variant="ghost"
          isLoading={testing}
          loadingText="Testing"
          data-testid="settings-provider-test"
          onClick={async () => {
            setTesting(true);
            try {
              setHealth(await probeChainProviders());
            } catch (e) {
              setHealth(getProviderHealth());
            } finally {
              setTesting(false);
            }
          }}
        >
          Test connection
        </Button>
      </Flex>

      {['blockfrost', 'koios'].map((name) => (
        <Flex
          key={name}
          align="center"
          justify="space-between"
          gap={3}
          py={2}
          borderTopWidth="1px"
          borderColor={rowDivider}
          data-testid={`settings-provider-${name}`}
        >
          <Flex align="center" gap={2} flexShrink={0}>
            <Box
              w="8px"
              h="8px"
              rounded="full"
              bg={dotColor(health[name].state)}
            />
            <Text fontSize="sm">{PROVIDER_LABELS[name]}</Text>
          </Flex>
          <Text
            fontSize="xs"
            color={mutedFg}
            textAlign="right"
            noOfLines={2}
            data-testid={`settings-provider-${name}-detail`}
          >
            {describeProviderHealth(health[name])}
          </Text>
        </Flex>
      ))}

      <Text
        fontSize="xs"
        color={mutedFg}
        mt={2}
        data-testid="settings-provider-summary"
      >
        {summary}
      </Text>
    </Box>
  );
}
