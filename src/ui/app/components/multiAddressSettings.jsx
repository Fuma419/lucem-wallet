import {
  Box,
  Button,
  Flex,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import React from 'react';
import { useStoreState } from 'easy-peasy';
import {
  disableExternalAddressIndex,
  enableExternalAddressIndex,
  getEnabledPaymentAddressDetails,
  getExternalIndices,
  MAX_EXTERNAL_ADDRESS_INDEX,
} from '../../../api/extension';
import UnitDisplay from './unitDisplay';

/**
 * Account panel: always-on multi-address listing for the selected account.
 * Shows funded addresses plus user-activated receive addresses (ADA, UTxOs,
 * native assets). Discovery keeps empty addresses enabled for balance/signing
 * without listing them here.
 */
const MultiAddressSettings = ({ account, onIndicesChange }) => {
  const toast = useToast();
  const settings = useStoreState((state) => state.settings.settings);
  const hintColor = useColorModeValue('gray.600', 'whiteAlpha.500');
  const rowBg = useColorModeValue('gray.100', 'whiteAlpha.50');
  const rowBorder = useColorModeValue('gray.200', 'whiteAlpha.100');
  const rowText = useColorModeValue('gray.900', 'white');

  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const indices = getExternalIndices(account);

  const refreshRows = React.useCallback(async () => {
    try {
      const next = await getEnabledPaymentAddressDetails({
        accountsDisplay: true,
      });
      setRows(next);
    } catch (_) {
      setRows([]);
    }
  }, []);

  React.useEffect(() => {
    refreshRows();
  }, [account?.index, account?.externalIndices, account?.internalIndices, refreshRows]);

  const notify = (indicesNext) => {
    onIndicesChange?.(indicesNext);
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
    <Box w="full" data-testid="multi-address-always-on">
      <Flex direction="column" gap={2} w="full">
        {rows.length === 0 ? (
          <Text fontSize="sm" color={hintColor}>
            Loading addresses…
          </Text>
        ) : null}
        {rows.map((row) => (
          <Flex
            key={`${row.role ?? 0}-${row.index}`}
            align="flex-start"
            justify="space-between"
            gap={2}
            px={3}
            py={3}
            rounded="lg"
            bg={rowBg}
            borderWidth="1px"
            borderColor={rowBorder}
            data-testid={`multi-address-row-${row.role ?? 0}-${row.index}`}
          >
            <Box minW={0} flex="1">
              <Text fontSize="xs" fontWeight="bold" color={rowText}>
                #{row.index}
                {row.role === 1
                  ? ' · change'
                  : row.index === 0
                    ? ' · primary'
                    : ' · receive'}
              </Text>
              <Text
                fontSize="xs"
                color={hintColor}
                fontFamily="mono"
                mt={1}
                wordBreak="break-all"
                title={row.paymentAddr}
                data-testid={`multi-address-addr-${row.role ?? 0}-${row.index}`}
              >
                {row.paymentAddr}
              </Text>
              <Flex
                mt={2}
                gap={3}
                flexWrap="wrap"
                align="baseline"
                data-testid={`multi-address-contents-${row.role ?? 0}-${row.index}`}
              >
                <UnitDisplay
                  quantity={row.lovelace ?? '0'}
                  decimals={6}
                  symbol={settings.adaSymbol}
                  fontSize="sm"
                  fontWeight="semibold"
                  color={rowText}
                />
                <Text fontSize="xs" color={hintColor}>
                  {row.utxoCount ?? 0} UTxO
                  {(row.utxoCount ?? 0) === 1 ? '' : 's'}
                </Text>
                <Text fontSize="xs" color={hintColor}>
                  {row.nativeAssetCount ?? 0} asset
                  {(row.nativeAssetCount ?? 0) === 1 ? '' : 's'}
                </Text>
              </Flex>
            </Box>
            {row.role === 1 || row.index === 0 ? (
              <Text fontSize="xs" color={hintColor} flexShrink={0} pt={0.5}>
                {row.role === 1 ? 'Auto' : 'Always on'}
              </Text>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                isDisabled={busy}
                onClick={() => removeIndex(row.index)}
                flexShrink={0}
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
          data-testid="multi-address-add"
        >
          {nextIndex > MAX_EXTERNAL_ADDRESS_INDEX
            ? 'Address limit reached'
            : `Add address #${nextIndex}`}
        </Button>
      </Flex>
    </Box>
  );
};

export default MultiAddressSettings;
