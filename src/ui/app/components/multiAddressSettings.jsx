import {
  Box,
  Button,
  Collapse,
  Flex,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import React from 'react';
import {
  disableExternalAddressIndex,
  enableExternalAddressIndex,
  getEnabledPaymentAddresses,
  getExternalIndices,
  isMultiAddressEnabled,
  MAX_EXTERNAL_ADDRESS_INDEX,
  setAccountExternalIndices,
} from '../../../api/extension';
import { SettingsToggleRow } from './settingsChrome';

const truncateAddr = (addr) => {
  if (!addr || addr.length < 20) return addr || '';
  return `${addr.slice(0, 12)}…${addr.slice(-8)}`;
};

/**
 * Settings panel: enable extra CIP-1852 external receive addresses on the
 * current account (balances / UTxOs / signing aggregate across them).
 */
const MultiAddressSettings = ({ account, onIndicesChange }) => {
  const toast = useToast();
  const hintColor = useColorModeValue('gray.600', 'whiteAlpha.500');
  const rowBg = useColorModeValue('gray.100', 'whiteAlpha.50');
  const rowBorder = useColorModeValue('gray.200', 'whiteAlpha.100');
  const rowText = useColorModeValue('gray.900', 'white');

  const [advancedOn, setAdvancedOn] = React.useState(false);
  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const indices = getExternalIndices(account);

  const refreshRows = React.useCallback(async () => {
    try {
      const next = await getEnabledPaymentAddresses();
      setRows(next);
    } catch (_) {
      setRows([]);
    }
  }, []);

  React.useEffect(() => {
    setAdvancedOn(isMultiAddressEnabled(account));
  }, [account?.index, account?.externalIndices, account?.internalIndices]);

  React.useEffect(() => {
    if (advancedOn) {
      refreshRows();
    }
  }, [advancedOn, account?.externalIndices, account?.internalIndices, refreshRows]);

  const notify = (indicesNext) => {
    onIndicesChange?.(indicesNext);
  };

  const onToggleAdvanced = async (checked) => {
    setBusy(true);
    try {
      if (!checked) {
        const next = await setAccountExternalIndices([0]);
        setAdvancedOn(false);
        notify(next);
        toast({
          title: 'Multi-address off',
          description: 'Only the primary address is active.',
          status: 'info',
          duration: 2500,
          isClosable: true,
        });
      } else {
        setAdvancedOn(true);
        await refreshRows();
      }
    } catch (e) {
      toast({
        title: 'Could not update addresses',
        description: e?.message || String(e),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const nextIndex = (() => {
    const max = indices.length ? Math.max(...indices) : 0;
    return max + 1;
  })();

  const addNext = async () => {
    if (nextIndex > MAX_EXTERNAL_ADDRESS_INDEX) return;
    setBusy(true);
    try {
      const next = await enableExternalAddressIndex(nextIndex);
      notify(next);
      await refreshRows();
    } catch (e) {
      toast({
        title: 'Could not enable address',
        description: e?.message || String(e),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const removeIndex = async (addressIndex) => {
    if (addressIndex === 0) return;
    setBusy(true);
    try {
      const next = await disableExternalAddressIndex(addressIndex);
      notify(next);
      if (
        !isMultiAddressEnabled({
          externalIndices: next,
          internalIndices: account?.internalIndices,
        })
      ) {
        setAdvancedOn(false);
      }
      await refreshRows();
    } catch (e) {
      toast({
        title: 'Could not disable address',
        description: e?.message || String(e),
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box w="full">
      <SettingsToggleRow
        label="Multi-address"
        hint="Include additional receive addresses and any change addresses found on this stake key. Primary address stays the default receive address."
        isChecked={advancedOn}
        isDisabled={busy}
        onChange={onToggleAdvanced}
        aria-label="Enable multi-address"
      />

      <Collapse in={advancedOn} animateOpacity>
        <Flex direction="column" gap={2} mt={4} w="full">
          {rows.map((row) => (
            <Flex
              key={`${row.role ?? 0}-${row.index}`}
              align="center"
              justify="space-between"
              gap={2}
              px={3}
              py={2}
              rounded="lg"
              bg={rowBg}
              borderWidth="1px"
              borderColor={rowBorder}
            >
              <Box minW={0}>
                <Text fontSize="xs" fontWeight="bold" color={rowText}>
                  #{row.index}
                  {row.role === 1
                    ? ' · change'
                    : row.index === 0
                      ? ' · primary'
                      : ''}
                </Text>
                <Text
                  fontSize="xs"
                  color={hintColor}
                  fontFamily="mono"
                  noOfLines={1}
                  title={row.paymentAddr}
                >
                  {truncateAddr(row.paymentAddr)}
                </Text>
              </Box>
              {row.role === 1 || row.index === 0 ? (
                <Text fontSize="xs" color={hintColor}>
                  {row.role === 1 ? 'Auto' : 'Always on'}
                </Text>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  isDisabled={busy}
                  onClick={() => removeIndex(row.index)}
                >
                  Remove
                </Button>
              )}
            </Flex>
          ))}

          <Button
            size="sm"
            variant="outline"
            rounded="lg"
            isDisabled={busy || nextIndex > MAX_EXTERNAL_ADDRESS_INDEX}
            onClick={addNext}
            mt={1}
          >
            {nextIndex > MAX_EXTERNAL_ADDRESS_INDEX
              ? 'Address limit reached'
              : `Add address #${nextIndex}`}
          </Button>
        </Flex>
      </Collapse>
    </Box>
  );
};

export default MultiAddressSettings;
