import { ExternalLinkIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';
import React from 'react';
import { updateTxInfo } from '../../../api/extension';
import UnitDisplay from './unitDisplay';
import {
  Box,
  Link,
  Text,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  VStack,
  HStack,
  Icon,
  useColorModeValue,
  Skeleton,
  Badge,
  Tooltip,
  IconButton,
  useClipboard,
} from '@chakra-ui/react';
import { compileOutputs } from '../../../api/util';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import ReactTimeAgo from 'react-time-ago';
import { Button } from '@chakra-ui/react';
import ReactDOMServer from 'react-dom/server';
import AssetsPopover from './assetPopoverDiff';
import AssetFingerprint from '@emurgo/cip14-js';
import { hexToAscii } from '../../../api/util';
import { NETWORK_ID } from '../../../config/config';
import { useStoreState } from 'easy-peasy';
import { FaCoins, FaPiggyBank, FaTrashAlt, FaRegEdit, FaUserCheck, FaUsers, FaRegFileCode } from 'react-icons/fa';
import { IoRemoveCircleSharp } from 'react-icons/io5';
import { TiArrowForward, TiArrowBack, TiArrowShuffle, TiArrowLoop } from 'react-icons/ti';
import { GiAnvilImpact } from 'react-icons/gi';
import Loader from '../../../api/loader';

TimeAgo.addDefaultLocale(en);

const txTypeColor = {
  self: 'gray.500',
  internalIn: 'gray.500',
  externalIn: 'gray.500',
  internalOut: 'orange.500',
  externalOut: 'orange.600',
  withdrawal: 'gray.500',
  delegation: 'blue.500',
  stake: 'blue.700',
  unstake: 'blue.400',
  poolUpdate: 'blue.400',
  poolRetire: 'red.400',
  mint: 'blue.500',
  multisig: 'orange.400',
  contract: 'yellow.400',
};

const txTypeLabel = {
  withdrawal: 'Withdrawal',
  delegation: 'Delegation',
  stake: 'Stake Registration',
  unstake: 'Stake Deregistration',
  poolUpdate: 'Pool Update',
  poolRetire: 'Pool Retire',
  mint: 'Minting',
  multisig: 'Multi-signatures',
  contract: 'Contract',
};

const txFlowLabel = {
  self: 'Self transfer',
  internalIn: 'Internal receive',
  internalOut: 'Internal send',
  externalIn: 'Receive',
  externalOut: 'Send',
  multisig: 'Multi-signature',
};

const useIsMounted = () => {
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => (isMounted.current = false);
  }, []);
  return isMounted;
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timed out loading transaction')), ms)
    ),
  ]);

const Transaction = ({
  txHash,
  detail,
  currentAddr,
  addresses,
  network,
  onLoad,
}) => {
  const [displayInfo, setDisplayInfo] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const isMounted = useIsMounted();

  const settings = useStoreState((state) => state.settings.settings);
  const colorMode = {
    iconBg: useColorModeValue('blue.100', 'gray.900'),
    txBg: useColorModeValue('blue.100', 'gray.900'),
    txBgHover: useColorModeValue('blue.300', 'gray.900'),
    assetsBtnHover: useColorModeValue('yellow.300', 'gray.900'),
  };

  const getTxDetail = async () => {
    if (displayInfo || failed) return;
    try {
      const txDetail = await withTimeout(updateTxInfo(txHash), 25000);
      onLoad(txHash, txDetail);
      if (!isMounted.current) return;
      const newDisplayInfo = genDisplayInfo(
        txHash,
        txDetail,
        currentAddr,
        addresses
      );
      if (!newDisplayInfo) {
        // Incomplete/undecodable detail: fall back instead of an endless skeleton.
        setFailed(true);
        return;
      }
      setDisplayInfo(newDisplayInfo);
    } catch (error) {
      if (!isMounted.current) return;
      console.warn(
        'Failed to load transaction detail',
        txHash,
        error?.message || error
      );
      setFailed(true);
    }
  };

  React.useEffect(() => {
    getTxDetail();
  });

  return (
    <AccordionItem borderTop="none" _last={{ borderBottom: 'none' }}>
      <VStack spacing={2}>
        {displayInfo ? (
          <Box align="center" fontSize={14} fontWeight={500} color="gray.500">
            <ReactTimeAgo
              date={displayInfo.date}
              title={displayInfo.formatDate}
              locale="en-US"
              timeStyle="round-minute"
            />
          </Box>
        ) : failed ? null : (
          <Skeleton width="34%" height="22px" rounded="md" />
        )}
        {displayInfo ? (
          <AccordionButton
            display="flex"
            justifyContent="space-between"
            bg={colorMode.txBg}
            borderRadius={20}
            borderLeftRadius={30}
            p={0}
            width="70%"  // Adjust the width here
            maxWidth="70%" // Set a maximum width, optional
            _hover={{ backgroundColor: colorMode.txBgHover }}
            _focus={{ border: 'none' }}
            whiteSpace="nowrap"
            overflowWrap="normal"
            wordBreak="normal"
          >
            <Box
              display="flex"
              flexShrink={5}
              p={5}
              borderRadius={50}
              bg={colorMode.iconBg}
              position="relative"
              left="-15px"
            >
              <TxIcon txType={displayInfo.type} extra={displayInfo.extra} />
            </Box>
            <Box
              display="flex"
              flexDirection="column"
              textAlign="center"
              position="relative"
              left="-15px"
            >
              {displayInfo.lovelace !== undefined &&
              displayInfo.lovelace !== null ? (
                <HStack spacing={1} justify="center">
                  <Text
                    fontSize={18}
                    fontWeight="bold"
                    color={
                      displayInfo.lovelace >= 0 ? 'green.400' : 'red.400'
                    }
                  >
                    {displayInfo.lovelace >= 0 ? '+' : '−'}
                  </Text>
                  <UnitDisplay
                    fontSize={18}
                    fontWeight="bold"
                    color={
                      displayInfo.lovelace >= 0 ? 'green.400' : 'red.400'
                    }
                    quantity={(displayInfo.lovelace < 0
                      ? -displayInfo.lovelace
                      : displayInfo.lovelace
                    ).toString()}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                </HStack>
              ) : displayInfo.extra.length ? (
                <Text fontSize={12} fontWeight="semibold" color="orange.600">
                  {getTxExtra(displayInfo.extra)}
                </Text>
              ) : (
                ''
              )}
              <Text fontSize={11} fontWeight="semibold" color="gray.500">
                {txFlowLabel[displayInfo.type] || 'Transaction'}
              </Text>
              {!['internalIn', 'externalIn'].includes(displayInfo.type) ? (
                <Box flexDirection="row" fontSize={12}>
                  Fee:{' '}
                  <UnitDisplay
                    display="inline-block"
                    quantity={displayInfo.detail.info.fees}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                  {parseInt(displayInfo.detail.info.deposit) ? (
                    <>
                      {parseInt(displayInfo.detail.info.deposit) > 0
                        ? ' & Deposit: '
                        : ' & Refund: '}
                      <UnitDisplay
                        display="inline-block"
                        quantity={
                          parseInt(displayInfo.detail.info.deposit) > 0
                            ? displayInfo.detail.info.deposit
                            : parseInt(displayInfo.detail.info.deposit) * -1
                        }
                        decimals={6}
                        symbol={settings.adaSymbol}
                      />
                    </>
                  ) : (
                    ''
                  )}
                </Box>
              ) : (
                ''
              )}

              {displayInfo.assets.length > 0 ? (
                <Box flexDirection="row" fontSize={12}>
                  <Text
                    display="inline-block"
                    fontWeight="bold"
                    _hover={{ backgroundColor: colorMode.assetsBtnHover }}
                    borderRadius="md"
                  >
                    <AssetsPopover assets={displayInfo.assets} isDifference />
                  </Text>
                </Box>
              ) : (
                ''
              )}
            </Box>
            <AccordionIcon color="yellow.500" mr={5} fontSize={20} />
          </AccordionButton>
        ) : failed ? (
          <TxFallback txHash={txHash} network={network} />
        ) : (
          <Skeleton width="100%" height="72px" rounded="md" />
        )}
        <AccordionPanel wordBreak="break-word" pb={4}>
          {displayInfo && (
            <TxDetail displayInfo={displayInfo} network={network} />
          )}
        </AccordionPanel>
        <Box display="flex" flexDirection="column" alignItems="center">
          <Box
            _before={{ content: '" "' }}
            w={5}
            h={5}
            mb={1}
            borderColor="yellow.600"
            borderWidth={5}
            borderRadius={50}
          ></Box>
          <Box
            _before={{ content: '" "' }}
            w={1}
            h={8}
            bg="orange.500"
            mb={2}
          ></Box>
        </Box>
      </VStack>
    </AccordionItem>
  );
};

const TxFallback = ({ txHash, network }) => {
  const explorer = explorerBase(network);
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      bg="gray.900"
      borderRadius={20}
      px={4}
      py={3}
      width="70%"
      maxWidth="70%"
    >
      <Text fontSize="xs" color="gray.500">
        Details unavailable
      </Text>
      <Link
        href={explorer.tx ? explorer.tx + txHash : undefined}
        isExternal
        color="blue.400"
        fontSize="xs"
      >
        {truncateMiddle(txHash)} <ExternalLinkIcon mx="1px" />
      </Link>
    </Box>
  );
};

const TxIcon = ({ txType, extra }) => {
  const icons = {
    self: TiArrowLoop,
    internalIn: TiArrowShuffle,
    externalIn: TiArrowForward,
    internalOut: TiArrowShuffle,
    externalOut: TiArrowBack,
    withdrawal: FaCoins,
    delegation: FaPiggyBank,
    stake: FaUserCheck,
    unstake: IoRemoveCircleSharp,
    poolUpdate: FaRegEdit,
    poolRetire: FaTrashAlt,
    mint: GiAnvilImpact,
    multisig: FaUsers,
    contract: FaRegFileCode,
  };

  if (extra.length) txType = extra[0];

  let style;
  switch (txType) {
    case 'externalIn':
      style = { transform: 'rotate(90deg)' };
      break;
    case 'internalOut':
      style = { transform: 'rotate(180deg)' };
      break;
    default:
      style = {};
  }

  return (
    <Icon
      as={icons[txType]}
      style={style}
      w={8}
      h={8}
      color={txTypeColor[txType]}
    />
  );
};

const DetailRow = ({ label, children, align = 'flex-start' }) => (
  <HStack align={align} justify="space-between" spacing={3} w="100%">
    <Text fontSize="xs" fontWeight="bold" color="gray.500" flexShrink={0}>
      {label}
    </Text>
    <Box fontSize="xs" textAlign="right" wordBreak="break-all">
      {children}
    </Box>
  </HStack>
);

const TxDetail = ({ displayInfo, network }) => {
  const settings = useStoreState((state) => state.settings.settings);
  const valueColor = useColorModeValue('gray.700', 'gray.200');
  const panelBg = useColorModeValue('gray.50', 'gray.800');

  const info = displayInfo.detail.info || {};
  const block = displayInfo.detail.block || {};
  const explorer = explorerBase(network);

  const blockHeight = block.block_height ?? info.block_height;
  const epochNo = block.epoch_no ?? info.epoch_no;
  const absSlot = block.abs_slot ?? info.absolute_slot;
  const confirmed = blockHeight !== undefined && blockHeight !== null;

  const deposit = parseInt(info.deposit);
  const outgoing = !['internalIn', 'externalIn', 'multisig'].includes(
    displayInfo.type
  );
  const counterparty = displayInfo.counterparty;

  return (
    <Box
      bg={panelBg}
      borderRadius="lg"
      p={3}
      mx="auto"
      maxW="90%"
      color={valueColor}
    >
      <VStack spacing={2} align="stretch">
        <DetailRow label="Status" align="center">
          <HStack spacing={2} justify="flex-end">
            <Badge
              colorScheme={confirmed ? 'green' : 'yellow'}
              variant="subtle"
              borderRadius="md"
            >
              {confirmed ? 'Confirmed' : 'Pending'}
            </Badge>
            <Text color="gray.500">{displayInfo.timestamp}</Text>
          </HStack>
        </DetailRow>

        {counterparty ? (
          <DetailRow label={counterparty.direction}>
            <VStack spacing={0} align="flex-end">
              {counterparty.addresses.slice(0, 3).map((addr) => (
                <HStack key={addr} spacing={1} justify="flex-end">
                  <Link
                    href={explorer.address ? explorer.address + addr : undefined}
                    isExternal
                    color="blue.400"
                  >
                    {truncateMiddle(addr)}
                  </Link>
                  <CopyButton value={addr} label="Copy address" />
                </HStack>
              ))}
              {counterparty.addresses.length > 3 ? (
                <Text color="gray.500">
                  +{counterparty.addresses.length - 3} more
                </Text>
              ) : null}
            </VStack>
          </DetailRow>
        ) : null}

        {outgoing ? (
          <>
            <DetailRow label="Network fee" align="center">
              <UnitDisplay
                display="inline-block"
                quantity={info.fees}
                decimals={6}
                symbol={settings.adaSymbol}
              />
            </DetailRow>
            {deposit ? (
              <DetailRow label={deposit > 0 ? 'Deposit' : 'Refund'} align="center">
                <UnitDisplay
                  display="inline-block"
                  quantity={deposit > 0 ? info.deposit : deposit * -1}
                  decimals={6}
                  symbol={settings.adaSymbol}
                />
              </DetailRow>
            ) : null}
          </>
        ) : null}

        <DetailRow label="Transaction ID" align="center">
          <HStack spacing={1} justify="flex-end">
            <Link
              href={explorer.tx ? explorer.tx + displayInfo.txHash : undefined}
              isExternal
              color="blue.400"
            >
              {truncateMiddle(displayInfo.txHash)} <ExternalLinkIcon mx="1px" />
            </Link>
            <CopyButton value={displayInfo.txHash} label="Copy transaction ID" />
          </HStack>
        </DetailRow>

        {confirmed ? (
          <DetailRow label="On-chain" align="center">
            <HStack spacing={3} justify="flex-end" color="gray.500" flexWrap="wrap">
              {blockHeight !== undefined ? (
                <Text>Block {Number(blockHeight).toLocaleString('en-US')}</Text>
              ) : null}
              {epochNo !== undefined && epochNo !== null ? (
                <Text>Epoch {epochNo}</Text>
              ) : null}
              {absSlot !== undefined && absSlot !== null ? (
                <Text>Slot {Number(absSlot).toLocaleString('en-US')}</Text>
              ) : null}
            </HStack>
          </DetailRow>
        ) : null}

        {displayInfo.extra.length > 0 ? (
          <DetailRow label="Activity" align="center">
            <Text fontWeight="semibold">{getTxExtra(displayInfo.extra)}</Text>
          </DetailRow>
        ) : null}

        {displayInfo.detail.metadata.length > 0 ? (
          <Box textAlign="right">
            <Button
              colorScheme="blue"
              variant="outline"
              size="xs"
              onClick={() => viewMetadata(displayInfo.detail.metadata)}
            >
              See Metadata
            </Button>
          </Box>
        ) : null}
      </VStack>
    </Box>
  );
};

const genDisplayInfo = (txHash, detail, currentAddr, addresses) => {
  
  if (!detail || !detail.info || !detail.utxos || !detail.block) {
    return null;
  }

  const type = getTxType(currentAddr, addresses, detail.utxos);
  
  const date = dateFromUnix(detail.block.block_time || detail.block.time);
  
  const amounts = calculateAmount(
    currentAddr,
    detail.utxos,
    detail.info.valid_contract
  );
  
  const assets = amounts.filter((amount) => amount.unit !== 'lovelace');
  const lovelaceAmount = amounts.find((amount) => amount.unit === 'lovelace');
  const lovelace = lovelaceAmount ? BigInt(lovelaceAmount.quantity) : 0n;

  const extra = getExtra(detail.info, type);

  let displayLovelace = ['internalIn', 'externalIn', 'multisig'].includes(type)
    ? lovelace
    : lovelace +
      BigInt(detail.info.fees) +
      (parseInt(detail.info.deposit) > 0
        ? BigInt(detail.info.deposit)
        : BigInt(0));

  if (type === 'self' && extra.length > 0 && displayLovelace === 0n) {
    displayLovelace = null;
  }

  const counterparty = getCounterparty(type, detail, currentAddr, addresses);

  const result = {
    txHash: txHash,
    detail: detail,
    date: date,
    timestamp: getTimestamp(date),
    type: type,
    extra: extra,
    counterparty: counterparty,
    amounts: amounts,
    lovelace: displayLovelace,
    assets: assets.map((asset) => {
      const _policy = asset.unit.slice(0, 56);
      const _name = asset.unit.slice(56);
      const fingerprint = new AssetFingerprint(
        Buffer.from(_policy, 'hex'),
        Buffer.from(_name, 'hex')
      ).fingerprint();

      return {
        unit: asset.unit,
        quantity: asset.quantity,
        policy: _policy,
        name: hexToAscii(_name),
        fingerprint,
      };
    }),
  };
  
  return result;
};

const getTxType = (currentAddr, addresses, uTxOList) => {
  const [, ownStakeCred] = getAddressCredentials(currentAddr);
  // Own = current payment addr or any address under the same stake key
  // (change / other CIP-1852 indices). Other Lucem accounts stay "internal".
  const isOwn = (addr) => {
    if (!addr) return false;
    if (addr === currentAddr) return true;
    const [, stakeCred] = getAddressCredentials(addr);
    return Boolean(ownStakeCred && stakeCred && stakeCred === ownStakeCred);
  };
  const isInternalPeer = (addr) =>
    Boolean(addr && Array.isArray(addresses) && addresses.includes(addr) && !isOwn(addr));

  let inputsAddr = uTxOList.inputs.map((utxo) => utxo.address);
  let outputsAddr = uTxOList.outputs.map((utxo) => utxo.address);

  if (inputsAddr.every((addr) => isOwn(addr))) {
    return outputsAddr.every((addr) => isOwn(addr))
      ? 'self'
      : outputsAddr.some((addr) => isInternalPeer(addr))
        ? 'internalOut'
        : 'externalOut';
  } else if (inputsAddr.every((addr) => !isOwn(addr))) {
    return inputsAddr.some((addr) => isInternalPeer(addr))
      ? 'internalIn'
      : 'externalIn';
  }
  return 'multisig';
};

const dateFromUnix = (unixTimestamp) => {
  // Handle invalid timestamps
  if (!unixTimestamp || isNaN(unixTimestamp) || unixTimestamp <= 0) {
    return new Date(); // Return current date as fallback
  }
  return new Date(unixTimestamp * 1000);
};

const getTimestamp = (date) => {
  const zeroLead = (str) => ('0' + str).slice(-2);

  return `${date.getFullYear()}-${zeroLead(date.getMonth() + 1)}-${zeroLead(
    date.getDate()
  )} ${zeroLead(date.getHours())}:${zeroLead(date.getMinutes())}:${zeroLead(
    date.getSeconds()
  )}`;
};

const getAddressCredentials = (address) => {
  if (!address) {
    return [null, null];
  }

  try {
    const cmlAddress = Loader.Cardano.Address.from_bech32(address);
    const paymentCred = cmlAddress.payment_cred()?.to_hex() || null;

    const baseAddr = Loader.Cardano.BaseAddress.from_address(cmlAddress);
    if (baseAddr) {
      const stakeCred = baseAddr.stake_cred()?.to_hex() || null;
      return [paymentCred, stakeCred];
    }

    const rewardAddr = Loader.Cardano.RewardAddress.from_address(cmlAddress);
    if (rewardAddr) {
      return [null, rewardAddr.payment_cred()?.to_hex() || null];
    }

    return [paymentCred, null];
  } catch (error) {
    try {
      const cmlAddress = Loader.Cardano.ByronAddress.from_base58(address);
      const paymentCred = cmlAddress.to_address()?.payment_cred()?.to_hex() || null;
      return [paymentCred, null];
    } catch (byronError) {
      console.error('Failed to parse address:', address, error);
      return [null, null];
    }
  }
};

const matchesAnyCredential = (address, [ownPaymentCred, ownStakingCred]) => {
  const [otherPaymentCred, otherStakingCred] = getAddressCredentials(address);
  // Same stake key ⇒ own wallet (other payment/change index under this account).
  if (
    otherStakingCred &&
    ownStakingCred &&
    otherStakingCred === ownStakingCred
  ) {
    return true;
  }
  if (otherPaymentCred && ownPaymentCred) {
    return otherPaymentCred === ownPaymentCred;
  }
  return false;
};

const calculateAmount = (currentAddr, uTxOList, validContract = true) => {
  
  if (!validContract) return [];
  if (!uTxOList || !uTxOList.inputs || !uTxOList.outputs) {
    return [];
  }

  const [ownPaymentCred, ownStakingCred] = getAddressCredentials(currentAddr);

  const normalizeAddress = (utxo) =>
    utxo.payment_addr?.bech32 ||
    utxo.address ||
    utxo.payment_addr ||
    utxo.stake_address ||
    utxo.stake_addr?.bech32 ||
    utxo.stake_addr ||
    null;

  // Convert Koios UTXO format to expected format
  const convertKoiosUtxo = (utxo) => ({
    address: normalizeAddress(utxo),
    stake_address: utxo.stake_addr || utxo.stake_address,
    tx_hash: utxo.tx_hash,
    tx_index: utxo.tx_index,
    value: utxo.value,
    asset_list: utxo.asset_list || [],
    datum_hash: utxo.datum_hash,
    inline_datum: utxo.inline_datum,
    reference_script: utxo.reference_script,
    // Convert Koios amount format to expected format
    amount: [
      { unit: 'lovelace', quantity: utxo.value || '0' },
      ...(utxo.asset_list || []).map(asset => ({
        unit: asset.policy_id + asset.asset_name,
        quantity: asset.quantity || '0'
      }))
    ]
  });

  let inputs = compileOutputs(
    uTxOList.inputs.map(convertKoiosUtxo).filter(
      (input) => {
        const matches = matchesAnyCredential(input.address, [ownPaymentCred, ownStakingCred]) && !(input.collateral && validContract);
        return matches;
      }
    )
  );

  let outputs = compileOutputs(
    uTxOList.outputs.map(convertKoiosUtxo).filter(
      (output) => {
        const matches = matchesAnyCredential(output.address, [ownPaymentCred, ownStakingCred]) && !(output.collateral && validContract);
        return matches;
      }
    )
  );
  
  let amounts = [];

  while (inputs.length) {
    let input = inputs.pop();
    let outputIndex = outputs.findIndex((amount) => amount.unit === input.unit);
    let qty;

    if (outputIndex > -1) {
      qty =
        (BigInt(input.quantity) - BigInt(outputs[outputIndex].quantity)) *
        BigInt(-1);
      outputs.splice(outputIndex, 1);
    } else {
      qty = BigInt(input.quantity) * BigInt(-1);
    }

    if (qty !== BigInt(0) || input.unit === 'lovelace')
      amounts.push({
        unit: input.unit,
        quantity: qty,
      });
  }

  return amounts.concat(outputs);
};

const getExtra = (info, txType) => {
  let extra = [];
  if (info.redeemer_count) {
    extra.push('contract');
  } else if (txType === 'multisig') {
    extra.push('multisig');
  }
  if (info.withdrawal_count && txType === 'self') extra.push('withdrawal');
  if (info.delegation_count) extra.push('delegation');
  if (info.asset_mint_or_burn_count) extra.push('mint');
  if (info.stake_cert_count && parseInt(info.deposit) >= 0) extra.push('stake');
  if (info.stake_cert_count && parseInt(info.deposit) < 0)
    extra.push('unstake');
  if (info.pool_retire_count) extra.push('poolRetire');
  if (info.pool_update_count) extra.push('poolUpdate');

  return extra;
};

const viewMetadata = (metadata) => {
  const HighlightJson = () => (
    <html lang="en">
      <head>
        <title>Metadata</title>
      </head>
      <body style={{ backgroundColor: '#2b2b2b' }}>
        <pre
          style={{
            padding: '8px',
            color: '#f8f8f2',
            fontSize: '14px',
            lineHeight: '20px',
          }}
        >
          <code>
            {JSON.stringify(
              metadata.map((m) => ({ [m.label]: m.json_metadata })),
              null,
              2
            )}
          </code>
        </pre>
      </body>
    </html>
  );
  var newTab = window.open();
  newTab.document.write(ReactDOMServer.renderToString(<HighlightJson />));
  newTab.document.close();
};

const getTxExtra = (extra) =>
  extra.map((item, index, array) =>
    index < array.length - 1 ? txTypeLabel[item] + ', ' : txTypeLabel[item]
  );

const isOwnAddress = (address, addresses, ownCreds) => {
  if (!address) return false;
  if (Array.isArray(addresses) && addresses.includes(address)) return true;
  return matchesAnyCredential(address, ownCreds);
};

// Derive the external counterparty: the recipient(s) we paid on an outgoing tx,
// or the sender(s) that funded an incoming tx. Own/change addresses are skipped.
const getCounterparty = (type, detail, currentAddr, addresses) => {
  if (!detail || !detail.utxos) return null;
  if (type === 'self') return null;

  const ownCreds = getAddressCredentials(currentAddr);
  const incoming = ['internalIn', 'externalIn'].includes(type);
  const source = incoming ? detail.utxos.inputs : detail.utxos.outputs;
  if (!Array.isArray(source)) return null;

  const seen = new Set();
  const external = [];
  for (const utxo of source) {
    const addr = utxo && utxo.address;
    if (!addr || isOwnAddress(addr, addresses, ownCreds) || seen.has(addr)) {
      continue;
    }
    seen.add(addr);
    external.push(addr);
  }

  if (external.length === 0) return null;
  return { direction: incoming ? 'From' : 'To', addresses: external };
};

const truncateMiddle = (value, lead = 12, tail = 8) => {
  if (typeof value !== 'string' || value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
};

const explorerBase = (network) => {
  switch (network.id) {
    case NETWORK_ID.mainnet:
      return { tx: 'https://cardanoscan.io/transaction/', address: 'https://cardanoscan.io/address/' };
    case NETWORK_ID.preprod:
      return {
        tx: 'https://testnet.cardanoscan.io/transaction/',
        address: 'https://testnet.cardanoscan.io/address/',
      };
    case NETWORK_ID.preview:
      return { tx: 'https://preview.cexplorer.io/tx/', address: 'https://preview.cexplorer.io/address/' };
    case NETWORK_ID.testnet:
      return { tx: 'https://testnet.cexplorer.io/tx/', address: 'https://testnet.cexplorer.io/address/' };
    default:
      return { tx: '', address: '' };
  }
};

const CopyButton = ({ value, label }) => {
  const { hasCopied, onCopy } = useClipboard(value || '');
  return (
    <Tooltip label={hasCopied ? 'Copied' : label || 'Copy'} closeOnClick={false} fontSize="xs">
      <IconButton
        aria-label={label || 'Copy'}
        icon={hasCopied ? <CheckIcon color="green.400" /> : <CopyIcon />}
        size="xs"
        variant="ghost"
        onClick={onCopy}
      />
    </Tooltip>
  );
};

export default Transaction;

export {
  calculateAmount,
  matchesAnyCredential,
  getAddressCredentials,
  getTxType,
  getCounterparty,
  truncateMiddle,
};
