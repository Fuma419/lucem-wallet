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
import { useStoreState } from 'easy-peasy';
import {
  disableExternalAddressIndex,
  enableExternalAddressIndex,
  getEnabledPaymentAddressDetails,
  getExternalIndices,
  isMultiAddressEnabled,
  MAX_EXTERNAL_ADDRESS_INDEX,
} from '../../../api/extension';
import { SettingsToggleRow } from './settingsChrome';
import UnitDisplay from './unitDisplay';

/**
 * Account panel: review CIP-1852 receive / change addresses for the selected
 * account with per-address contents (ADA, UTxOs, native assets). Account totals
 * remain stake-controlled across all of these.
 */
const MultiAddressSettings = ({ account, onIndicesChange }) => {
  const toast = useToast();
  const settings = useStoreState((state) => state.settings.settings);
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
      // Accounts list: funded addresses + user-activated externals only.
      const next = await getEnabledPaymentAddressDetails({
        accountsDisplay: true,
      });
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
        // Collapse the panel only — keep discovered external/internal indices
        // so change-address funds remain spendable after Soft refresh.
        setAdvancedOn(false);
        toast({
          title: 'Address list hidden',
          description:
            'Discovered receive and change addresses stay active for balance and sends.',
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
        hint="Shows addresses that hold assets, plus receive addresses you activate. Discovered empty addresses stay hidden but remain active for balance and sends."
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
