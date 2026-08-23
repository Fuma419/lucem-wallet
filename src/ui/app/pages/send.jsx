import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createTab,
  openKeystoneSignTxTab,
  displayUnit,
  getAccounts,
  getAdaHandle,
  getAsset,
  getCurrentAccount,
  getNetwork,
  getSignableWalletIds,
  getUtxos,
  indexToHw,
  isAccountSignable,
  isHW,
  isValidAddress,
  paymentKeyHashesForSigning,
  prependTxHash,
  toUnit,
  updateRecentSentToAddress,
} from '../../../api/extension';
import { Scrollbars } from '../components/scrollbar';
import ConfirmModal from '../components/confirmModal';
import {
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  InfoOutlineIcon,
  SmallCloseIcon,
} from '@chakra-ui/icons';
import {
  Box,
  Flex,
  Stack,
  Text,
  Button,
  Alert,
  AlertDescription,
  AlertIcon,
  Avatar,
  IconButton,
  Input,
  InputGroup,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  useDisclosure,
  InputRightElement,
  InputLeftElement,
  Spinner,
  Checkbox,
  Tooltip,
  useColorModeValue,
  useToast,
  Icon,
} from '@chakra-ui/react';
import MiddleEllipsis from 'react-middle-ellipsis';
import UnitDisplay from '../components/unitDisplay';
import {
  buildTx,
  initTx,
  sendAllTx,
  signAndSubmit,
  signAndSubmitHW,
  summarizeSendAll,
} from '../../../api/extension/wallet';
import {
  sumUtxos,
  valueToAssets,
  assetsToValue,
  minAdaRequired,
} from '../../../api/util';
import {
  formatUtxoBalanceInsufficient,
  matchSpendableToken,
  resolveTokenSendQuantity,
} from '../../../api/token-amount';
import { FixedSizeList as List } from 'react-window';
import AssetBadge from '../components/assetBadge';
import { ERROR, HW, NETWORK_ID, TAB } from '../../../config/config';
import { Planet } from 'react-kawaii';
import Loader from '../../../api/loader';
import { action, useStoreActions, useStoreState } from 'easy-peasy';
import AvatarLoader from '../components/avatarLoader';
import { NumericFormat } from 'react-number-format';
import Copy from '../components/copy';
import AssetsModal from '../components/assetsModal';
import { MdContentPaste, MdModeEdit, MdVpnKey } from 'react-icons/md';
import ValidateSeedModal from '../components/validateSeedModal';
import useSurfaceColors from '../hooks/useSurfaceColors';
import useConstant from 'use-constant';
import debouncePromise from 'debounce-promise';
import latest from 'promise-latest';
import {
  isSameAccountIndex,
  otherLoadedAccounts,
} from '../utils/accountIndex';

const NETWORK_LABEL = {
  [NETWORK_ID.mainnet]: 'Mainnet',
  [NETWORK_ID.preprod]: 'Preprod',
  [NETWORK_ID.preview]: 'Preview',
  [NETWORK_ID.testnet]: 'Testnet',
};

const stripAdaInput = (raw) => String(raw || '').replace(/[,\s]/g, '');

/** One-line bech32 for confirm / review — MiddleEllipsis wraps on narrow iOS. */
const shortenAddress = (addr) => {
  if (!addr || typeof addr !== 'string') return '';
  if (addr.length <= 22) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
};

/** Native tokens default to 0 decimals. Missing metadata must not inherit ADA's 6. */
const tokenDecimals = (asset) => {
  if (!asset || asset.decimals == null || asset.decimals === '') return 0;
  const n = Number(asset.decimals);
  return Number.isFinite(n) ? n : 0;
};

const adaInputToLovelace = (raw) => {
  const cleaned = stripAdaInput(raw);
  if (!cleaned || cleaned === '.') return 0n;
  try {
    return BigInt(toUnit(cleaned));
  } catch {
    return 0n;
  }
};

const reviewBlockedReason = ({
  accountSignable,
  address,
  value,
  feeError,
  tx,
  sendAllRiskAccepted,
}) => {
  if (!accountSignable) return 'Restore this account’s recovery phrase to sign.';
  if (address?.error) return address.error;
  if (!address?.result) return 'Enter a recipient address.';
  if (!value?.sendAll && !value?.ada && !(value?.assets || []).length) {
    return 'Enter an amount to send.';
  }
  if (value?.sendAll && !sendAllRiskAccepted) {
    return 'Confirm you understand send-all risk.';
  }
  if (feeError) return feeError;
  if (!tx) return 'Preparing transaction…';
  return '';
};

const useIsMounted = () => {
  const isMounted = React.useRef(false);
  React.useEffect(() => {
    isMounted.current = true;
    return () => (isMounted.current = false);
  }, []);
  return isMounted;
};

const RecipientAccountPicker = ({
  accounts,
  isDisabled,
  selectedAddress,
  onSelect,
}) => {
  const { cardBg, cardHoverBg, mutedFg, yellowLink } = useSurfaceColors();
  const selectedBorder = useColorModeValue('yellow.500', 'yellow.400');
  const idleBorder = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');
  if (!accounts?.length) return null;
  return (
    <Box
      data-testid="send-recipient-accounts"
      maxH="220px"
      overflowY="auto"
      mb={3}
    >
      <Stack spacing={2}>
        {accounts.map((row) => {
          const selected = row.paymentAddr === selectedAddress;
          return (
            <Button
              key={String(row.index)}
              data-testid={`send-recipient-account-${row.index}`}
              variant="ghost"
              isDisabled={isDisabled}
              onClick={() => onSelect(row)}
              justifyContent="flex-start"
              h="auto"
              py={2}
              px={2}
              rounded="xl"
              w="full"
              bg={selected ? cardHoverBg : cardBg}
              borderWidth="1px"
              borderColor={selected ? selectedBorder : idleBorder}
              _hover={{ bg: cardHoverBg }}
            >
              <Flex align="center" w="full" minW={0} gap={3}>
                <Box flexShrink={0}>
                  <AvatarLoader width="32px" avatar={row.avatar} />
                </Box>
                <Box minW={0} flex="1" textAlign="left">
                  <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
                    {row.name || 'Account'}
                  </Text>
                  <Text
                    fontSize="xs"
                    fontFamily="mono"
                    color={selected ? yellowLink : mutedFg}
                    whiteSpace="nowrap"
                  >
                    {shortenAddress(row.paymentAddr)}
                  </Text>
                </Box>
              </Flex>
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
};

// Build CIP-0020 transaction message metadata (label 674) for an optional note,
// returning `null` when there is nothing to attach. Extracted so both the
// regular and send-all paths share one implementation.
const buildOptionalMessageMetadata = (Cardano, message) => {
  if (!message) return null;
  const chunkSubstr = (str, size) => {
    const numChunks = Math.ceil(str.length / size);
    const chunks = new Array(numChunks);
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
      chunks[i] = str.substr(o, size);
    }
    return chunks;
  };
  const auxiliaryData = Cardano.AuxiliaryData.new();
  const generalMetadata = Cardano.GeneralTransactionMetadata.new();
  const msg = { msg: chunkSubstr(message, 64) };
  generalMetadata.set(
    BigInt('674'),
    Cardano.encode_json_str_to_metadatum(JSON.stringify(msg), 1)
  );
  if (generalMetadata.len() > 0) {
    auxiliaryData.add_metadata(generalMetadata);
  }
  return auxiliaryData.metadata() ? auxiliaryData : null;
};

const initialState = {
  fee: { fee: '0' },
  value: { ada: '', assets: [], personalAda: '', minAda: '0', sendAll: false },
  address: { result: '', display: '' },
  message: '',
  tx: null,
  txInfo: {
    protocolParameters: null,
    utxos: [],
    balance: { lovelace: '0', assets: null },
  },
};

const sendPreparationErrorMessage = (error) => {
  const message = error?.message || String(error || '');
  if (!message) return 'Unable to prepare transaction.';
  const tokenBalance = formatUtxoBalanceInsufficient(message);
  if (tokenBalance !== message) return tokenBalance;
  if (/no utxos|insufficient|not enough/i.test(message)) {
    return message;
  }
  return `Unable to prepare transaction: ${message}`;
};

export const sendStore = {
  ...initialState,
  setFee: action((state, fee) => {
    state.fee = fee;
  }),
  setValue: action((state, value) => {
    state.value = value;
  }),
  setMessage: action((state, message) => {
    state.message = message;
  }),
  setTx: action((state, tx) => {
    state.tx = tx;
  }),
  setAddress: action((state, address) => {
    state.address = address;
  }),
  setTxInfo: action((state, txInfo) => {
    state.txInfo = txInfo;
  }),
  reset: action((state) => {
    state.fee = initialState.fee;
    state.value = initialState.value;
    state.message = initialState.message;
    state.address = initialState.address;
    state.tx = initialState.tx;
    state.txInfo = initialState.txInfo;
  }),
};

const Send = () => {
  const isMounted = useIsMounted();
  const settings = useStoreState((state) => state.settings.settings);
  const { pageBg, pageFg, mutedFg, subtleFg, inputBg } =
    useSurfaceColors();
  const [address, setAddress] = [
    useStoreState((state) => state.globalModel.sendStore.address),
    useStoreActions((actions) => actions.globalModel.sendStore.setAddress),
  ];
  const [value, setValue] = [
    useStoreState((state) => state.globalModel.sendStore.value),
    useStoreActions((actions) => actions.globalModel.sendStore.setValue),
  ];
  const [message, setMessage] = [
    useStoreState((state) => state.globalModel.sendStore.message),
    useStoreActions((actions) => actions.globalModel.sendStore.setMessage),
  ];
  const [txInfo, setTxInfo] = [
    useStoreState((state) => state.globalModel.sendStore.txInfo),
    useStoreActions((actions) => actions.globalModel.sendStore.setTxInfo),
  ];
  const [fee, setFee] = [
    useStoreState((state) => state.globalModel.sendStore.fee),
    useStoreActions((actions) => actions.globalModel.sendStore.setFee),
  ];
  const [tx, setTx] = [
    useStoreState((state) => state.globalModel.sendStore.tx),
    useStoreActions((actions) => actions.globalModel.sendStore.setTx),
  ];

  const [txUpdate, setTxUpdate] = React.useState(false);
  const triggerTxUpdate = (stateChange) => {
    stateChange();
    setTxUpdate((update) => !update);
  };

  const utxos = React.useRef(null);
  const assets = React.useRef({});
  const account = React.useRef(null);
  const resetState = useStoreActions(
    (actions) => actions.globalModel.sendStore.reset
  );
  const navigate = useNavigate();
  const toast = useToast();
  const ref = React.useRef();

  const startKeystoneQrSign = React.useCallback(async () => {
    if (!tx) {
      toast({
        title: 'No transaction to sign',
        status: 'warning',
        duration: 3000,
      });
      return;
    }
    const acc = account.current;
    try {
      if (!acc?.paymentKeyHash) {
        throw new Error(
          'This Keystone account is missing a payment key. Reconnect the device and try again.'
        );
      }
      const paymentHashes = await paymentKeyHashesForSigning(acc);
      await openKeystoneSignTxTab({
        txHex: tx,
        keyHashes: [...paymentHashes, acc.stakeKeyHash],
        partialSign: false,
      });
      toast({
        title: 'Keystone signing (QR)',
        description:
          'A tab opened for QR signing. Complete it on your Keystone; nothing is submitted until you finish there.',
        status: 'info',
        duration: 8000,
        isClosable: true,
      });
    } catch (e) {
      const errMsg = e?.message || String(e);
      toast({
        status: 'error',
        duration: 20000,
        isClosable: true,
        render: ({ onClose }) => (
          <Alert
            status="error"
            rounded="xl"
            bg="red.900"
            color="white"
            cursor="pointer"
            _hover={{ opacity: 0.85 }}
            onClick={() => {
              navigator.clipboard.writeText(errMsg);
              toast({ title: 'Copied', status: 'info', duration: 1200 });
              onClose();
            }}
            title="Tap to copy"
            p={4}
          >
            <AlertIcon />
            <Box>
              <Text fontWeight="bold" fontSize="sm">Could not open Keystone signing</Text>
              <Text fontSize="xs">{errMsg}</Text>
            </Box>
          </Alert>
        ),
      });
      throw e;
    }
  }, [tx, toast]);
  const [isLoading, setIsLoading] = React.useState(true);
  const focus = React.useRef(false);
  const [sendAllRiskAccepted, setSendAllRiskAccepted] = React.useState(false);
  // Software accounts restored from a sterilized backup have metadata but no
  // vault key. They can *build* a tx and then die at sign with
  // "No stored key for wallet …". Detect that up front so Send prompts to
  // re-enter the recovery phrase instead of a dead-end confirm error.
  const [accountSignable, setAccountSignable] = React.useState(true);
  const [otherAccounts, setOtherAccounts] = React.useState([]);
  const validateSeedRef = React.useRef();

  const network = React.useRef();
  const assetsModalRef = React.useRef();

  const setSendAllMode = (enabled) => {
    if (enabled) {
      const allAssets = (txInfo.balance.assets || []).map((asset) => ({
        ...asset,
        input: asset.quantity,
      }));
      assets.current = {};
      allAssets.forEach((asset) => {
        assets.current[asset.unit] = { ...asset };
      });

      const maxAdaDisplay = displayUnit(txInfo.balance.lovelace || '0').toString();
      triggerTxUpdate(() =>
        setValue({
          ...value,
          sendAll: true,
          ada: maxAdaDisplay,
          personalAda: maxAdaDisplay,
          assets: allAssets,
        })
      );
      setSendAllRiskAccepted(false);
      return;
    }

    assets.current = {};
    triggerTxUpdate(() =>
      setValue({
        ...value,
        sendAll: false,
        ada: '',
        personalAda: '',
        assets: [],
      })
    );
    setSendAllRiskAccepted(false);
  };

  const prepareTx = async (count, data) => {
    if (!isMounted.current) return;
    await Loader.load();
    await new Promise((res, rej) => {
      const interval = setInterval(() => {
        if (utxos.current) {
          clearInterval(interval);
          res();
          return;
        }
      });
    });
    const _value = data.value;
    const _address = data.address;
    const _message = data.message;
    const protocolParameters = data.protocolParameters;
    const sendAllMode = Boolean(_value.sendAll);
    const hasAmount = Boolean(_value.ada) || _value.assets.length > 0;

    if (!sendAllMode && !hasAmount) {
      setFee({ fee: '0' });
      setTx(null);
      return;
    }

    if (
      _address.error ||
      !_address.result ||
      (!sendAllMode && !hasAmount) ||
      (_address.isM1 &&
        !sendAllMode &&
        BigInt(toUnit(_value.ada || '0')) <
          BigInt(_address.ada.minLovelace) +
            BigInt(_address.ada.fromADAFeeLovelace))
    ) {
      setFee({ fee: '0' });
      setTx(null);
      return;
    }

    setFee({ fee: '' });
    setTx(null);
    await new Promise((res, rej) => setTimeout(() => res()));
    try {
      // Optional CIP-0020 message metadata is shared by both send paths.
      const optionalAuxiliaryData = buildOptionalMessageMetadata(
        Loader.Cardano,
        _message
      );

      if (sendAllMode) {
        // Sweep the whole wallet in one shot: the dedicated builder forces every
        // UTxO in and lets a single fee/change pass settle the remainder, so no
        // funds are stranded and every token moves. Feasibility and min-ADA are
        // enforced inside the builder, so the single-output pre-check below is
        // deliberately skipped. Fee and swept amount are read straight from the
        // built transaction — never from `txInfo.balance`, whose rehydrated
        // values can be non-canonical strings that break `BigInt()` on stricter
        // engines (JavaScriptCore: "Failed to parse String to BigInt").
        const finalTx = await sendAllTx(
          utxos.current,
          _address.result,
          protocolParameters,
          optionalAuxiliaryData
        );

        const { fee, sent } = summarizeSendAll(finalTx);
        const sendAllDisplay = displayUnit(sent).toString();
        setValue({
          ..._value,
          ada: sendAllDisplay,
          personalAda: sendAllDisplay,
        });
        setFee({ fee });
        setTx(Buffer.from(finalTx.to_bytes()).toString('hex'));
        return;
      }

      const output = {
        address: _address.result,
        amount: [
          {
            unit: 'lovelace',
            quantity: toUnit(_value.ada || '0'),
          },
        ],
      };

      const spendableAssets = await valueToAssets(
        await sumUtxos(utxos.current)
      ).then((listed) => listed.filter((row) => row.unit !== 'lovelace'));

      for (const asset of _value.assets) {
        const inventory = matchSpendableToken(asset, spendableAssets);
        if (!inventory) {
          setFee({
            error:
              'Not enough of the selected token in spendable UTxOs. Check the token amount, or send ADA only.',
          });
          return;
        }
        const live = assets.current[inventory.unit] || assets.current[asset.unit] || {
          ...asset,
          ...inventory,
        };
        const resolved = resolveTokenSendQuantity(
          live.input ?? asset.input,
          tokenDecimals(live),
          inventory.quantity
        );
        if (resolved.error) {
          setFee({ error: resolved.error });
          return;
        }

        output.amount.push({
          unit: inventory.unit,
          quantity: resolved.quantity,
        });
      }

      const addressBytes = await isValidAddress(_address.result);
      const address = Loader.Cardano.Address.from_bytes(new Uint8Array(addressBytes));
      let outputValue = await assetsToValue(output.amount);
      const checkOutput = Loader.Cardano.TransactionOutput.new(address, outputValue);

      const minAda = await minAdaRequired(
        checkOutput,
        protocolParameters.coinsPerUtxoWord
      );

      if (BigInt(minAda) <= BigInt(toUnit(_value.personalAda || '0'))) {
        const displayAda = parseFloat(
          _value.personalAda.replace(/[,\s]/g, '')
        ).toLocaleString('en-EN', { minimumFractionDigits: 6 });
        output.amount[0].quantity = toUnit(_value.personalAda || '0');
        !focus.current && setValue({ ..._value, ada: displayAda });
      } else if (_value.assets.length > 0) {
        output.amount[0].quantity = minAda;
        const minAdaDisplay = parseFloat(
          displayUnit(minAda).toString().replace(/[,\s]/g, '')
        ).toLocaleString('en-EN', { minimumFractionDigits: 6 });
        setValue({
          ..._value,
          ada: minAdaDisplay,
          personalAda: minAdaDisplay,
        });
      }

      if (BigInt(minAda) > BigInt(output.amount[0].quantity || '0')) {
        setFee({
          error: 'Transaction not possible',
        });
        return;
      }

      const buildTxForOutput = async (amount) => {
        const valueForOutput = await assetsToValue(amount);
        const outputs = Loader.Cardano.TransactionOutputs.new();
        outputs.add(Loader.Cardano.TransactionOutput.new(address, valueForOutput));
        return buildTx(
          account.current,
          utxos.current,
          outputs,
          protocolParameters,
          optionalAuxiliaryData
        );
      };

      const tx = await buildTxForOutput(output.amount);
      setFee({ fee: tx.body().fee().toString() });
      setTx(Buffer.from(tx.to_bytes()).toString('hex'));
    } catch (e) {
      console.warn(e);
      setFee({ error: sendPreparationErrorMessage(e) });
    }
  };

  const prepareTxDebounced = useConstant(() =>
    debouncePromise(latest(prepareTx), 300)
  );

  const init = async () => {
    if (!isMounted.current) return;
    addAssets(value.assets);
    await Loader.load();
    const currentAccount = await getCurrentAccount();
    try {
      const allAccounts = await getAccounts();
      if (isMounted.current) {
        setOtherAccounts(otherLoadedAccounts(allAccounts, currentAccount.index));
      }
    } catch (e) {
      console.warn('Could not load other accounts for Send', e);
    }
    const _network = await getNetwork();
    network.current = _network;
    account.current = currentAccount;
    try {
      const ids = await getSignableWalletIds();
      if (isMounted.current) {
        setAccountSignable(isAccountSignable(currentAccount, ids));
      }
    } catch (e) {
      // Fail open only if the vault lookup itself throws; a missing seed is
      // reported as an empty id list, not an exception.
      console.warn('Could not determine account signability', e);
    }
    // Always re-fetch spendable UTxOs. Persisted txInfo can list a token in
    // `balance.assets` while the stored hex UTxOs no longer contain it (or
    // never did), which made Review fail with UTxO Balance Insufficient.
    let _utxos = await getUtxos();
    if (!Array.isArray(_utxos)) _utxos = [];
    const protocolParameters = txInfo.protocolParameters
      ? { ...txInfo.protocolParameters }
      : await initTx();

    const Cardano = Loader.Cardano;
    const canUseCsl = Boolean(
      Cardano?.TransactionOutput?.new &&
        Cardano?.Address?.from_bech32 &&
        Cardano?.Value?.zero
    );

    if (canUseCsl && currentAccount.paymentAddr) {
      const checkOutput = Cardano.TransactionOutput.new(
        Cardano.Address.from_bech32(currentAccount.paymentAddr),
        Cardano.Value.zero()
      );
      protocolParameters.minUtxo = await minAdaRequired(
        checkOutput,
        BigInt(protocolParameters.coinsPerUtxoWord)
      );
    } else if (protocolParameters.minUtxo == null) {
      protocolParameters.minUtxo = '0';
    }

    let balance = txInfo.balance || { lovelace: '0', assets: [] };
    if (canUseCsl) {
      const utxoSum = await sumUtxos(_utxos);
      const listed = await valueToAssets(utxoSum);
      balance = {
        lovelace: listed.find((v) => v.unit === 'lovelace').quantity,
        assets: listed.filter((v) => v.unit !== 'lovelace'),
      };
    }
    let droppedUnspendable = false;
    Object.keys(assets.current).forEach((unit) => {
      const live = matchSpendableToken(
        assets.current[unit],
        balance.assets || []
      );
      if (!live) {
        delete assets.current[unit];
        droppedUnspendable = true;
        return;
      }
      const nextUnit = live.unit;
      assets.current[nextUnit] = {
        ...assets.current[unit],
        ...live,
        input: assets.current[unit].input,
      };
      if (nextUnit !== unit) delete assets.current[unit];
    });
    if (droppedUnspendable) {
      triggerTxUpdate(() =>
        setValue({ ...value, assets: objectToArray(assets.current) })
      );
    }
    utxos.current = _utxos;
    _utxos = _utxos.map((utxo) => Buffer.from(utxo.to_bytes()).toString('hex'));
    if (!isMounted.current) return;
    setIsLoading(false);
    setTxInfo({ protocolParameters, utxos: _utxos, balance });
  };

  const objectToArray = (obj) => Object.keys(obj).map((key) => obj[key]);

  const addAssets = (_assets) => {
    _assets.forEach((asset) => {
      assets.current[asset.unit] = { ...asset };
    });
    const assetsList = objectToArray(assets.current);
    triggerTxUpdate(() => setValue({ ...value, assets: assetsList }));
  };

  const removeAllAssets = () => {
    assets.current = {};
    triggerTxUpdate(() => setValue({ ...value, assets: [] }));
  };

  const removeAsset = (asset) => {
    delete assets.current[asset.unit];
    const assetsList = objectToArray(assets.current);
    triggerTxUpdate(() => setValue({ ...value, assets: assetsList }));
  };

  React.useEffect(() => {
    if (txInfo.protocolParameters) {
      setTx(null);
      setFee({ fee: '' });
      prepareTxDebounced(0, {
        value,
        address,
        message,
        protocolParameters: txInfo.protocolParameters,
      });
    }
  }, [txUpdate]);

  React.useEffect(() => {
    init().catch((e) => {
      console.warn(e);
      if (!isMounted.current) return;
      setFee({ error: sendPreparationErrorMessage(e) });
      setIsLoading(false);
    });
    return () => {
      resetState();
    };
  }, []);

  const confirmAssets = value.assets.map((asset) => {
    const live = assets.current[asset.unit] || asset;
    return {
      ...asset,
      ...live,
      quantity: value.sendAll
        ? String(live.quantity || asset.quantity || '0')
        : resolveTokenSendQuantity(
            live.input ?? asset.input,
            tokenDecimals(live),
            live.quantity ?? asset.quantity
          ).quantity || '0',
    };
  });
  const feeError = fee.error ? String(fee.error) : '';
  const actionLabel = value.sendAll ? 'Review send all' : 'Review transaction';
  const availableLovelace = BigInt(txInfo.balance?.lovelace || '0');
  const availableAda = displayUnit(availableLovelace.toString()).toString();
  const amountLovelace = adaInputToLovelace(value.ada);
  const minUtxo = BigInt(txInfo.protocolParameters?.minUtxo || '0');
  const amountTooSmall =
    !value.sendAll && amountLovelace > 0n && minUtxo > 0n && amountLovelace < minUtxo;
  const amountTooLarge =
    !value.sendAll && amountLovelace > 0n && amountLovelace > availableLovelace;
  const feeReady = Boolean(fee.fee && fee.fee !== '0' && /^\d+$/.test(String(fee.fee)));
  const isPreparing = Boolean(
    !fee.fee &&
      !feeError &&
      address.result &&
      !address.error &&
      (value.ada || value.assets.length > 0)
  );
  const blockedReason = reviewBlockedReason({
    accountSignable,
    address,
    value,
    feeError,
    tx,
    sendAllRiskAccepted,
  });
  const networkId = settings.network?.id || NETWORK_ID.mainnet;
  const networkLabel = NETWORK_LABEL[networkId] || networkId || 'Network';
  const resolvedHandle =
    address.display &&
    String(address.display).startsWith('$') &&
    address.result &&
    !address.error
      ? address.result
      : '';
  const sendingToAccount = otherAccounts.find(
    (row) => row.paymentAddr === address.result
  );

  const applyAdaShare = (numerator, denominator) => {
    if (value.sendAll || isLoading || availableLovelace <= 0n) return;
    let share = (availableLovelace * BigInt(numerator)) / BigInt(denominator);
    // "Max" on a regular send leaves a small fee headroom so change can form.
    if (numerator === denominator && share > 200000n) share -= 200000n;
    const display = displayUnit(share.toString()).toString();
    triggerTxUpdate(() =>
      setValue({
        ...value,
        ada: display,
        personalAda: display,
      })
    );
  };

  const openReview = () => {
    if (!accountSignable) return;
    if (blockedReason && blockedReason !== 'Preparing transaction…') return;
    if (!tx) return;
    const idx = account.current?.index;
    ref.current?.openModal(idx);
  };

  return (
    <>
      <Box
        data-testid="send-page"
        h="100%"
        maxH="100%"
        minH={0}
        display="flex"
        alignItems="stretch"
        flexDirection="column"
        position="relative"
        w="full"
        maxW="100%"
        bg={pageBg}
        color={pageFg}
        overflow="hidden"
        className="lucem-wallet-main-column lucem-settings-shell lucem-send-page"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'TEXTAREA') return;
            if (!blockedReason && tx) {
              e.preventDefault();
              openReview();
            }
          }
        }}
      >
        {txInfo.protocolParameters && isLoading ? (
          <Flex
            flex="1"
            minH="40vh"
            width="full"
            align="center"
            justify="center"
            direction="column"
            gap={3}
          >
            <Spinner color="yellow.400" speed="0.5s" />
            <Text fontSize="sm" color={mutedFg} data-testid="send-loading-copy">
              Loading your wallet…
            </Text>
          </Flex>
        ) : (
          <>
            <Flex
              align="center"
              px={{ base: 3, md: 5 }}
              pt="calc(0.75rem + env(safe-area-inset-top, 0px))"
              pb={2}
              gap={2}
            >
              <IconButton
                rounded="xl"
                onClick={() => navigate('/wallet', { replace: true })}
                variant="ghost"
                color={pageFg}
                _hover={{ bg: 'whiteAlpha.100' }}
                icon={<ChevronLeftIcon boxSize="6" />}
                aria-label="Go back"
              />
              <Text
                flex="1"
                textAlign="center"
                fontSize="xl"
                fontWeight="bold"
                data-testid="send-page-title"
              >
                Send
              </Text>
              <Text
                as="span"
                data-testid="send-network-badge"
                className={`network-banner network-banner-${networkId}`}
                role="status"
                aria-label={`Sending on ${networkLabel}`}
              >
                {networkLabel}
              </Text>
            </Flex>

            <Box
              data-testid="send-form-scroll"
              flex="1"
              minH={0}
              overflowY="auto"
              overflowX="hidden"
              overscrollBehavior="contain"
              w="full"
              px={{ base: 4, md: 6 }}
              pt={1}
              pb={4}
            >
              <Stack
                spacing={4}
                w="full"
                maxW={{ base: '100%', xl: 'sm' }}
                mx="auto"
              >
                <Box className="lucem-inset-surface" rounded="3xl" p={4}>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    letterSpacing="0.06em"
                    textTransform="uppercase"
                    color={subtleFg}
                    mb={2}
                  >
                    To
                  </Text>
                  <RecipientAccountPicker
                    accounts={otherAccounts}
                    isDisabled={isLoading}
                    selectedAddress={address.result}
                    onSelect={(row) => {
                      triggerTxUpdate(() =>
                        setAddress({
                          result: row.paymentAddr,
                          display: row.name || shortenAddress(row.paymentAddr),
                        })
                      );
                    }}
                  />
                  <AddressPopup
                    setAddress={setAddress}
                    address={address}
                    removeAllAssets={removeAllAssets}
                    triggerTxUpdate={triggerTxUpdate}
                    txInfo={txInfo}
                    isLoading={isLoading}
                  />
                  {sendingToAccount ? (
                    <Text
                      mt={2}
                      fontSize="xs"
                      color={mutedFg}
                      data-testid="send-recipient-account-name"
                    >
                      Sending to {sendingToAccount.name || 'another account'}
                    </Text>
                  ) : null}
                  {resolvedHandle ? (
                    <Text
                      mt={2}
                      fontSize="xs"
                      color={mutedFg}
                      data-testid="send-handle-resolved"
                    >
                      Resolves to{' '}
                      <Box as="span" fontFamily="mono">
                        {`${resolvedHandle.slice(0, 12)}…${resolvedHandle.slice(-8)}`}
                      </Box>
                    </Text>
                  ) : null}
                  {address.error ? (
                    <Text
                      mt={2}
                      fontSize="sm"
                      color="red.400"
                      data-testid="send-address-error"
                    >
                      {address.error}
                    </Text>
                  ) : null}
                </Box>

                <Box className="lucem-inset-surface" rounded="3xl" p={4}>
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      letterSpacing="0.06em"
                      textTransform="uppercase"
                      color={subtleFg}
                    >
                      Amount
                    </Text>
                    <Text
                      fontSize="xs"
                      color={mutedFg}
                      data-testid="send-available-balance"
                    >
                      Available {availableAda} {settings.adaSymbol}
                    </Text>
                  </Flex>
                  <InputGroup size="lg">
                    <InputLeftElement
                      h="56px"
                      children={
                        isLoading ? (
                          <Spinner color="yellow.400" size="xs" />
                        ) : (
                          <Text fontWeight="bold">{settings.adaSymbol}</Text>
                        )
                      }
                    />
                    <NumericFormat
                      data-testid="send-ada-amount"
                      className="lucem-send-amount"
                      h="56px"
                      pl="12"
                      allowNegative={false}
                      thousandsGroupStyle="thousand"
                      value={value.ada}
                      decimalSeparator="."
                      displayType="input"
                      type="text"
                      thousandSeparator={true}
                      fixedDecimalScale={true}
                      decimalScale={6}
                      onInput={(e) => {
                        const val = e.target.value;
                        value.ada = val;
                        value.personalAda = val;
                        const v = value;
                        triggerTxUpdate(() => setValue({ ...v }));
                      }}
                      variant="filled"
                      bg={inputBg}
                      isDisabled={isLoading || value.sendAll}
                      isInvalid={amountTooSmall || amountTooLarge}
                      onFocus={() => (focus.current = true)}
                      placeholder="0.000000"
                      customInput={Input}
                      fontSize="xl"
                      fontWeight="semibold"
                      rounded="xl"
                    />
                  </InputGroup>
                  {amountTooSmall ? (
                    <Text mt={2} fontSize="xs" color="red.400" data-testid="send-amount-hint">
                      Below the minimum ADA this output needs.
                    </Text>
                  ) : null}
                  {amountTooLarge ? (
                    <Text mt={2} fontSize="xs" color="red.400" data-testid="send-amount-hint">
                      Exceeds the available balance.
                    </Text>
                  ) : null}
                  {!value.sendAll ? (
                    <Flex mt={3} gap={2} wrap="wrap">
                      {[
                        { label: '25%', n: 1, d: 4, id: 'send-percent-25' },
                        { label: '50%', n: 1, d: 2, id: 'send-percent-50' },
                        { label: '75%', n: 3, d: 4, id: 'send-percent-75' },
                        { label: 'Max', n: 1, d: 1, id: 'send-percent-max' },
                      ].map((chip) => (
                        <Button
                          key={chip.id}
                          data-testid={chip.id}
                          size="xs"
                          variant="outline"
                          rounded="full"
                          isDisabled={isLoading || availableLovelace <= 0n}
                          onClick={() => applyAdaShare(chip.n, chip.d)}
                        >
                          {chip.label}
                        </Button>
                      ))}
                      <Button
                        data-testid="send-all-toggle"
                        size="xs"
                        rounded="full"
                        colorScheme={value.sendAll ? 'red' : 'gray'}
                        variant={value.sendAll ? 'solid' : 'ghost'}
                        isDisabled={isLoading}
                        onClick={() => setSendAllMode(!value.sendAll)}
                        ml="auto"
                      >
                        Send all
                      </Button>
                    </Flex>
                  ) : (
                    <Flex mt={3} justify="flex-end">
                      <Button
                        data-testid="send-all-toggle"
                        size="xs"
                        rounded="full"
                        colorScheme="red"
                        isDisabled={isLoading}
                        onClick={() => setSendAllMode(false)}
                      >
                        Disable send all
                      </Button>
                    </Flex>
                  )}
                  {value.sendAll && (
                    <Box
                      data-testid="send-all-warning"
                      mt={3}
                      borderWidth="1px"
                      borderColor="red.400"
                      bg="red.900"
                      color="red.100"
                      rounded="xl"
                      px={3}
                      py={3}
                    >
                      <Text fontSize="xs" mb={2}>
                        Send all attempts to transfer every spendable ADA and token from this account. Transactions are irreversible and a wrong address can permanently lose funds.
                      </Text>
                      <Checkbox
                        size="sm"
                        colorScheme="red"
                        isChecked={sendAllRiskAccepted}
                        onChange={(e) => setSendAllRiskAccepted(e.target.checked)}
                      >
                        <Text fontSize="xs">
                          I understand this is a high-risk action
                        </Text>
                      </Checkbox>
                    </Box>
                  )}
                </Box>

                <Box className="lucem-inset-surface" rounded="3xl" p={4}>
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      letterSpacing="0.06em"
                      textTransform="uppercase"
                      color={subtleFg}
                    >
                      Tokens
                    </Text>
                    <AssetsSelector
                      addAssets={addAssets}
                      assets={txInfo.balance.assets}
                      setValue={setValue}
                      value={value}
                      isSendAll={value.sendAll}
                    />
                  </Flex>
                  {value.sendAll ? (
                    <Text fontSize="sm" color={mutedFg}>
                      Sending all wallet assets ({value.assets.length} token
                      {value.assets.length === 1 ? '' : 's'}) to the destination.
                    </Text>
                  ) : value.assets.length === 0 ? (
                    <Text fontSize="sm" color={mutedFg} data-testid="send-tokens-empty">
                      No tokens selected. ADA-only is fine.
                    </Text>
                  ) : (
                    <Flex wrap="wrap" gap={2}>
                      {value.assets.map((asset, index) => (
                        <Box key={asset.unit || index}>
                          <AssetBadge
                            onRemove={() => {
                              removeAsset(asset);
                            }}
                            onLoad={(decimals) => {
                              if (!assets.current[asset.unit]) return;
                              if (assets.current[asset.unit].decimals === decimals) {
                                return;
                              }
                              assets.current[asset.unit].decimals = decimals;
                              triggerTxUpdate(() =>
                                setValue({
                                  ...value,
                                  assets: objectToArray(assets.current),
                                })
                              );
                            }}
                            onInput={async (val) => {
                              if (!assets.current[asset.unit]) return;
                              assets.current[asset.unit].input = val;
                              const v = value;
                              v.assets = objectToArray(assets.current);
                              triggerTxUpdate(() =>
                                setValue({ ...v, assets: v.assets })
                              );
                            }}
                            asset={asset}
                          />
                        </Box>
                      ))}
                    </Flex>
                  )}
                </Box>

                <Box className="lucem-inset-surface" rounded="3xl" p={4}>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    letterSpacing="0.06em"
                    textTransform="uppercase"
                    color={subtleFg}
                    mb={2}
                  >
                    Note
                    <Box as="span" fontWeight="normal" ml={2} color={mutedFg}>
                      optional
                    </Box>
                  </Text>
                  <InputGroup>
                    <InputLeftElement children={<Icon as={MdModeEdit} color={mutedFg} />} />
                    <Input
                      value={message}
                      onInput={(e) => {
                        const msg = e.target.value;
                        triggerTxUpdate(() => setMessage(msg));
                      }}
                      variant="filled"
                      bg={inputBg}
                      rounded="xl"
                      placeholder="Optional message (on-chain metadata)"
                      fontSize="sm"
                      data-testid="send-note-input"
                    />
                  </InputGroup>
                </Box>
              </Stack>
            </Box>

            <Box
              flexShrink={0}
              w="full"
              px={{ base: 4, md: 6 }}
              pt={3}
              pb="calc(0.85rem + env(safe-area-inset-bottom, 0px))"
              borderTopWidth="1px"
              borderTopColor="whiteAlpha.100"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              bg={pageBg}
            >
              {(feeReady || isPreparing) && (
                <Flex
                  data-testid="send-fee-preview"
                  w="full"
                  maxW={{ base: '100%', xl: 'sm' }}
                  mb={3}
                  px={1}
                  justify="space-between"
                  fontSize="sm"
                  color={mutedFg}
                >
                  <Text>Network fee</Text>
                  <Text fontWeight="semibold" color={pageFg}>
                    {isPreparing
                      ? 'Estimating…'
                      : `${displayUnit(fee.fee).toString()} ${settings.adaSymbol}`}
                  </Text>
                </Flex>
              )}
              {feeReady && amountLovelace > 0n ? (
                <Flex
                  data-testid="send-total-preview"
                  w="full"
                  maxW={{ base: '100%', xl: 'sm' }}
                  mb={3}
                  px={1}
                  justify="space-between"
                  fontSize="sm"
                  color={mutedFg}
                >
                  <Text>Total leaving wallet</Text>
                  <Text fontWeight="bold" color={pageFg}>
                    {displayUnit(
                      (amountLovelace + BigInt(fee.fee)).toString()
                    ).toString()}{' '}
                    {settings.adaSymbol}
                  </Text>
                </Flex>
              ) : null}
              {!accountSignable && (
                <Alert
                  data-testid="send-needs-seed-alert"
                  status="warning"
                  rounded="2xl"
                  bg="yellow.900"
                  color="yellow.100"
                  width={{ base: '90%', md: '366px' }}
                  maxWidth="366px"
                  mb={3}
                  flexDirection="column"
                  alignItems="stretch"
                >
                  <Flex align="flex-start">
                    <AlertIcon mt={1} />
                    <Box>
                      <Text fontWeight="bold" fontSize="sm">
                        Re-enter your recovery phrase
                      </Text>
                      <AlertDescription fontSize="sm">
                        This account can see balances but cannot sign. Restore
                        the recovery phrase to enable sending.
                      </AlertDescription>
                    </Box>
                  </Flex>
                  <Button
                    mt={3}
                    w="full"
                    rounded="xl"
                    colorScheme="yellow"
                    leftIcon={<Icon as={MdVpnKey} />}
                    data-testid="send-validate-seed-button"
                    onClick={() =>
                      validateSeedRef.current?.openModal({
                        accountKey: account.current?.index,
                        name: account.current?.name,
                      })
                    }
                  >
                    Restore seed to enable signing
                  </Button>
                </Alert>
              )}
              {feeError && (
                <Alert
                  data-testid="send-error-alert"
                  status="error"
                  rounded="2xl"
                  bg="red.900"
                  color="white"
                  width={{ base: '90%', md: '366px' }}
                  maxWidth="366px"
                  mb={3}
                  cursor="pointer"
                  _hover={{ opacity: 0.85 }}
                  onClick={() => {
                    navigator.clipboard.writeText(feeError).then(() =>
                      toast({ title: 'Error copied', status: 'info', duration: 1500 })
                    );
                  }}
                  title="Click to copy"
                >
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    {feeError}
                  </AlertDescription>
                </Alert>
              )}
              {blockedReason && !isPreparing ? (
                <Text
                  data-testid="send-blocked-reason"
                  fontSize="xs"
                  color={mutedFg}
                  mb={2}
                  textAlign="center"
                  maxW={{ base: '100%', xl: 'sm' }}
                >
                  {blockedReason}
                </Text>
              ) : null}
              <Button
                data-testid="send-primary-action"
                isLoading={isPreparing}
                loadingText="Estimating fee…"
                width="full"
                maxW={{ base: '100%', xl: 'sm' }}
                height="52px"
                rounded="2xl"
                isDisabled={
                  !accountSignable ||
                  !tx ||
                  !address.result ||
                  Boolean(feeError) ||
                  (value.sendAll && !sendAllRiskAccepted)
                }
                colorScheme="yellow"
                bg="yellow.400"
                color="gray.900"
                fontWeight="black"
                _hover={{
                  bg: 'yellow.300',
                  transform: 'translateY(-1px)',
                }}
                _active={{ bg: 'yellow.500' }}
                _disabled={{
                  bg: 'whiteAlpha.200',
                  color: 'whiteAlpha.500',
                  cursor: 'not-allowed',
                  transform: 'none',
                  opacity: 1,
                }}
                onClick={openReview}
              >
                {actionLabel}
              </Button>
            </Box>
          </>
        )}
      </Box>
      <AssetsModal ref={assetsModalRef} />
      <ConfirmModal
        title={'Confirm transaction'}
        info={
          <Box width="full" data-testid="send-confirm-breakdown">
            <Flex justify="space-between" mb={2} fontSize="sm">
              <Text color={mutedFg}>You send</Text>
              <UnitDisplay
                fontWeight="bold"
                hide
                quantity={toUnit(stripAdaInput(value.ada) || '0', 6)}
                decimals={6}
                symbol={settings.adaSymbol || '₳'}
              />
            </Flex>
            {confirmAssets.length > 0 && (
              <Button
                mb={2}
                size="xs"
                variant="outline"
                onClick={() =>
                  assetsModalRef.current.openModal({
                    userInput: true,
                    assets: confirmAssets,
                    background: 'red.400',
                    color: 'white',
                    title: (
                      <Box>
                        Sending{' '}
                        <Box as="span" color="red.400">
                          {confirmAssets.length}
                        </Box>{' '}
                        {confirmAssets.length == 1 ? 'asset' : 'assets'}
                      </Box>
                    ),
                  })
                }
              >
                + {confirmAssets.length}{' '}
                {confirmAssets.length > 1 ? 'tokens' : 'token'}
              </Button>
            )}
            <Flex
              justify="space-between"
              mb={2}
              fontSize="sm"
              align="flex-start"
              gap={3}
            >
              <Text color={mutedFg} flexShrink={0}>
                To
              </Text>
              <Copy label="Copied address" copy={address.result}>
                <Box
                  textAlign="right"
                  minW={0}
                  maxW="70%"
                  cursor="pointer"
                  data-testid="send-confirm-to"
                >
                  {sendingToAccount ? (
                    <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
                      {sendingToAccount.name || 'Account'}
                    </Text>
                  ) : null}
                  <Text
                    fontFamily="mono"
                    fontSize="xs"
                    whiteSpace="nowrap"
                    data-testid="send-confirm-to-address"
                  >
                    {shortenAddress(address.result)}
                  </Text>
                </Box>
              </Copy>
            </Flex>
            {feeReady ? (
              <Flex justify="space-between" mb={2} fontSize="sm">
                <Text color={mutedFg}>Network fee</Text>
                <UnitDisplay
                  quantity={fee.fee}
                  decimals={6}
                  symbol={settings.adaSymbol || '₳'}
                />
              </Flex>
            ) : null}
            {value.sendAll && (
              <Box
                mt={2}
                rounded="xl"
                borderWidth="1px"
                borderColor="red.300"
                bg="red.900"
                px={3}
                py={2}
              >
                <Text fontSize="xs" color="red.100">
                  Send all is enabled. This transaction attempts to empty the account except for network fees and cannot be undone.
                </Text>
              </Box>
            )}
            {address.isM1 && (
              <Text mt={2} fontWeight="bold" fontSize="sm" color="orange.300">
                Sending to Milkomeda
              </Text>
            )}
          </Box>
        }
        ref={ref}
        onHwKeystone={async () => {
          await startKeystoneQrSign();
        }}
        sign={async (password, hw) => {
          await Loader.load();
          const txDes = Loader.Cardano.Transaction.from_bytes(
            Buffer.from(tx, 'hex')
          );
          const paymentHashes = await paymentKeyHashesForSigning(
            account.current
          );
          if (hw) {
            if (hw.device === HW.trezor) {
              return createTab(TAB.trezorTx, `?tx=${tx}`);
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex: tx,
                keyHashes: [
                  ...paymentHashes,
                  account.current.stakeKeyHash,
                ],
                partialSign: false,
              });
            }
            return await signAndSubmitHW(txDes, {
              keyHashes: paymentHashes,
              account: account.current,
              hw,
            });
          } else
            return await signAndSubmit(
              txDes,
              {
                accountIndex: account.current.index,
                keyHashes: paymentHashes,
              },
              password
            );
        }}
        onConfirm={async (status, signedTx) => {
          if (status === true) {
            toast({
              title: 'Transaction submitted',
              description:
                typeof signedTx === 'string' && /^[a-f0-9]{64}$/i.test(signedTx)
                  ? `${signedTx.slice(0, 8)}…${signedTx.slice(-8)}`
                  : undefined,
              status: 'success',
              duration: 4000,
              isClosable: true,
            });
            if (typeof signedTx === 'string' && /^[a-f0-9]{64}$/i.test(signedTx)) {
              await prependTxHash(signedTx);
            }
            if (await isValidAddress(address.result))
              await updateRecentSentToAddress(address.result);
          } else if (signedTx === ERROR.fullMempool) {
            const errMsg = 'Mempool full. Try again.';
            toast({
              status: 'error',
              duration: 6000,
              render: ({ onClose }) => (
                <Alert
                  status="error"
                  rounded="xl"
                  bg="red.900"
                  color="white"
                  cursor="pointer"
                  _hover={{ opacity: 0.85 }}
                  onClick={() => {
                    navigator.clipboard.writeText(errMsg);
                    toast({ title: 'Copied', status: 'info', duration: 1200 });
                    onClose();
                  }}
                  title="Tap to copy"
                  p={4}
                >
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold" fontSize="sm">Transaction failed</Text>
                    <Text fontSize="xs">{errMsg}</Text>
                  </Box>
                </Alert>
              ),
            });
            ref.current.closeModal();
            return;
          } else {
            const description =
              signedTx == null
                ? undefined
                : typeof signedTx === 'string'
                  ? signedTx
                  : String(signedTx?.message || signedTx);

            const errMsg = description ? description.slice(0, 200) : 'Transaction failed';
            toast({
              status: 'error',
              duration: 6000,
              render: ({ onClose }) => (
                <Alert
                  status="error"
                  rounded="xl"
                  bg="red.900"
                  color="white"
                  cursor="pointer"
                  _hover={{ opacity: 0.85 }}
                  onClick={() => {
                    navigator.clipboard.writeText(errMsg);
                    toast({ title: 'Copied', status: 'info', duration: 1200 });
                    onClose();
                  }}
                  title="Tap to copy"
                  p={4}
                >
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold" fontSize="sm">Transaction failed</Text>
                    <Text fontSize="xs">{errMsg}</Text>
                  </Box>
                </Alert>
              ),
            });
          }
          ref.current.closeModal();
          setTimeout(() => {
            navigate('/wallet', { replace: true, state: status === true ? { postTx: true } : undefined });
          }, 200);
        }}
      />
      <ValidateSeedModal
        ref={validateSeedRef}
        onValidated={async () => {
          const acc = account.current;
          if (!acc) return;
          try {
            const ids = await getSignableWalletIds();
            setAccountSignable(isAccountSignable(acc, ids));
          } catch (e) {
            console.warn('Could not refresh account signability', e);
          }
        }}
      />
    </>
  );
};

// Address Popup
const AddressPopup = ({
  setAddress,
  address,
  triggerTxUpdate,
  removeAllAssets,
  txInfo,
  isLoading,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const checkColor = useColorModeValue('yellow.500', 'yellow.200');
  const ref = React.useRef(false);
  const [state, setState] = React.useState({
    currentAccount: null,
    accounts: {},
    recentAddress: null,
  });
  const latestHandleInputToken = React.useRef(0);
  const init = async () => {
    const currentAccount = await getCurrentAccount();
    const accounts = await getAccounts();
    const recentAddress =
      currentAccount.recentSendToAddresses &&
      currentAccount.recentSendToAddresses[0];
    setState({ currentAccount, accounts, recentAddress });
  };



  const handleInput = async (e) => {
    const value = e.target.value;
    let addr;
    let isHandle = false;
    
    if (!e.target.value) {
      addr = { result: '', display: '' };
    } else if (value.startsWith('$')) {
      isHandle = true;
      addr = { display: value };
    } else if (await isValidAddress(value)) {
      addr = { result: value, display: value };
    } else {
      addr = {
        result: value,
        display: value,
        error: 'Address is invalid',
      };
    }

    if (isHandle) {
      const handle = value;

      const resolvedAddress = await getAdaHandle(handle.slice(1));
      if (handle.length > 1 && (await isValidAddress(resolvedAddress))) {
        addr = {
          result: resolvedAddress,
          display: handle,
        };
      } else {
        addr = {
          result: '',
          display: handle,
          error: '$handle not found',
        };
      }
    }

    return addr;
  };

  const handleInputDebounced = useConstant(() =>
    debouncePromise(latest(handleInput), 700)
  );

  React.useEffect(() => {
    init();
  }, []);
  return (
    <Popover
      isOpen={
        state.currentAccount &&
        (state.recentAddress ||
          Object.keys(state.accounts).filter(
            (index) =>
              !isSameAccountIndex(index, state.currentAccount.index)
          ).length > 0) &&
        isOpen
      }
      onOpen={() => !isLoading && !address.result && !address.error && onOpen()}
      autoFocus={false}
      onClose={async () => {
        await new Promise((res, rej) => setTimeout(() => res()));
        if (ref.current) {
          ref.current = false;
          return;
        }
        onClose();
      }}
      gutter={1}
    >
      <PopoverTrigger>
        <InputGroup size="md">
          <Input
            disabled={isLoading}
            variant="filled"
            data-testid="send-recipient-input"
            autoComplete="off"
            value={address.display}
            spellCheck={false}
            rounded="xl"
            h="48px"
            onBlur={async (e) => {
              await new Promise((res, rej) => setTimeout(() => res()));
              if (ref.current) {
                ref.current = false;
                return;
              }
              onClose();
              setTimeout(() => e.target.blur());
            }}
            fontSize="sm"
            placeholder="Address, $handle, or paste"
            onInput={async (e) => {
              const handleInputToken = latestHandleInputToken.current + 1;
              latestHandleInputToken.current = handleInputToken;
              setAddress({ display: e.target.value });
              const addr = await handleInputDebounced(e);

              if (handleInputToken !== latestHandleInputToken.current) {
                return;
              }


              triggerTxUpdate(() => setAddress(addr));
              onClose();
            }}
            isInvalid={address.error}
          />
          <InputRightElement w="auto" pr={2} gap={1}>
            {address.result && !address.error ? (
              <CheckIcon boxSize="3" color={checkColor} mr={1} />
            ) : null}
            {address.display ? (
              <IconButton
                aria-label="Clear recipient"
                data-testid="send-recipient-clear"
                size="xs"
                variant="ghost"
                icon={<SmallCloseIcon />}
                onClick={() => {
                  triggerTxUpdate(() =>
                    setAddress({ result: '', display: '' })
                  );
                }}
              />
            ) : (
              <IconButton
                aria-label="Paste recipient"
                data-testid="send-recipient-paste"
                size="xs"
                variant="ghost"
                icon={<Icon as={MdContentPaste} />}
                onClick={async () => {
                  try {
                    const text =
                      (await navigator.clipboard.readText())?.trim() || '';
                    if (!text) return;
                    const fake = { target: { value: text } };
                    setAddress({ display: text });
                    const addr = await handleInput(fake);
                    triggerTxUpdate(() => setAddress(addr));
                  } catch {
                    /* clipboard denied — user can still paste natively */
                  }
                }}
              />
            )}
          </InputRightElement>
        </InputGroup>
      </PopoverTrigger>
      <PopoverContent
        onClick={() => {
          ref.current = false;
        }}
        onFocus={() => {
          ref.current = true;
        }}
        _focus={{ outline: 'none' }}
      >
        <PopoverBody pr="-2">
          <Scrollbars
            style={{ width: '100%', overflowX: 'hidden' }}
            autoHeight
            autoHeightMax={240}
          >
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              marginRight="4"
            >
              {state.recentAddress && (
                <Button
                  ml="2"
                  my="1"
                  variant="ghost"
                  width="full"
                  onClick={() => {
                    const address = state.recentAddress;
                    triggerTxUpdate(() =>
                      setAddress({
                        result: address,
                        display: address,
                      })
                    );
                    onClose();
                  }}
                >
                  <Box display="flex" flexDirection="column" width="full">
                    <Text fontWeight="bold" fontSize="13" textAlign="left">
                      Recent
                    </Text>
                    <Box h="0.5" />
                    <Box
                      fontSize="11"
                      textAlign="left"
                      whiteSpace="nowrap"
                      fontWeight="normal"
                    >
                      <MiddleEllipsis>
                        <span>{state.recentAddress}</span>
                      </MiddleEllipsis>
                    </Box>
                  </Box>
                </Button>
              )}
              {Object.keys(state.accounts).filter(
                (index) =>
                  !isSameAccountIndex(index, state.currentAccount.index)
              ).length > 0 && (
                <>
                  {' '}
                  <Text
                    width="full"
                    mt="3"
                    mb="2"
                    fontWeight="bold"
                    fontSize="13"
                    textAlign="left"
                  >
                    Accounts
                  </Text>
                  {Object.keys(state.accounts)
                    .filter(
                      (index) =>
                        !isSameAccountIndex(index, state.currentAccount.index)
                    )
                    .map((index) => {
                      const account = state.accounts[index];
                      return (
                        <Button
                          key={index}
                          ml="2"
                          my="1"
                          width="full"
                          variant="ghost"
                          onClick={() => {
                            const addr = account.paymentAddr;

                            triggerTxUpdate(() =>
                              setAddress({
                                result: addr,
                                display: addr,
                              })
                            );
                            onClose();
                          }}
                        >
                          <Box width="full" display="flex">
                            <Box ml="-1">
                              <AvatarLoader
                                width="30px"
                                avatar={account.avatar}
                              />
                            </Box>
                            <Box ml="4" display="flex" flexDirection="column">
                              <Text
                                fontWeight="bold"
                                fontSize="13"
                                textAlign="left"
                              >
                                {account.name}
                              </Text>
                              <Box
                                width="220px"
                                fontSize="11"
                                textAlign="left"
                                whiteSpace="nowrap"
                                fontWeight="normal"
                              >
                                <MiddleEllipsis>
                                  <span>{account.paymentAddr}</span>
                                </MiddleEllipsis>
                              </Box>
                            </Box>
                          </Box>
                        </Button>
                      );
                    })}{' '}
                </>
              )}
            </Box>
          </Scrollbars>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

// Asset Popup

const CustomScrollbars = ({ onScroll, forwardedRef, style, children }) => {
  const refSetter = React.useCallback((scrollbarsRef) => {
    if (scrollbarsRef) {
      forwardedRef(scrollbarsRef.view);
    } else {
      forwardedRef(null);
    }
  }, []);

  return (
    <Scrollbars
      ref={refSetter}
      style={{ ...style, overflow: 'hidden', marginRight: 4 }}
      onScroll={onScroll}
    >
      {children}
    </Scrollbars>
  );
};

const CustomScrollbarsVirtualList = React.forwardRef((props, ref) => (
  <CustomScrollbars {...props} forwardedRef={ref} />
));

const AssetsSelector = ({ assets, addAssets, value, isSendAll }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = React.useState('');
  const select = React.useRef(false);
  const [choice, setChoice] = React.useState({});

  const filterAssets = () => {
    const filter1 = (asset) =>
      value.assets.every((asset2) => asset.unit !== asset2.unit);
    const filter2 = (asset) =>
      search
        ? asset.name.toLowerCase().includes(search.toLowerCase()) ||
          asset.policy.includes(search) ||
          asset.fingerprint.includes(search)
        : true;
    return assets.filter((asset) => filter1(asset) && filter2(asset));
  };

  React.useEffect(() => {
    // Empty effect
  }, []);

  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <PopoverTrigger>
        <Button
          isDisabled={isSendAll || !assets || assets.length < 1}
          size="xs"
          rounded="full"
          variant="outline"
          data-testid="send-add-tokens"
        >
          {isSendAll ? 'Tokens included' : '+ Add tokens'}
        </Button>
      </PopoverTrigger>
      <PopoverContent w="98%" className="lucem-inset-surface">
        <PopoverArrow ml="4px" />
        <PopoverHeader
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <InputGroup
            width={Object.keys(choice).length <= 0 && '90%'}
            flex={Object.keys(choice).length > 0 && 3}
            size="sm"
          >
            <Input
              value={search}
              size="sm"
              variant="filled"
              placeholder="Search policy, asset, name"
              fontSize="xs"
              onInput={(e) => {
                setSearch(e.target.value);
              }}
            />
            <InputRightElement
              children={
                <SmallCloseIcon
                  cursor="pointer"
                  onClick={() => setSearch('')}
                />
              }
            />
          </InputGroup>
          {Object.keys(choice).length > 0 && (
            <>
              <Box w="2" />
              <Box
                width="100%"
                flex={1}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <IconButton
                  size="xs"
                  rounded="md"
                  onClick={() => setChoice({})}
                  icon={<CloseIcon />}
                />

                <Box w="3" />
                <IconButton
                  colorScheme="yellow"
                  size="xs"
                  rounded="md"
                  onClick={() => {
                    onClose();
                    setTimeout(() => {
                      addAssets(assets.filter((asset) => choice[asset.unit]));
                      setChoice({});
                    }, 100);
                  }}
                  icon={<CheckIcon />}
                />
              </Box>
            </>
          )}
        </PopoverHeader>
        <PopoverBody p="-2">
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
            my="1"
          >
            {assets ? (
              filterAssets().length > 0 ? (
                <List
                  outerElementType={CustomScrollbarsVirtualList}
                  height={200}
                  itemCount={filterAssets().length}
                  itemSize={45}
                  width={Math.min(385, typeof window !== 'undefined' ? window.innerWidth - 40 : 385)}
                  layout="vertical"
                >
                  {({ index, style }) => {
                    const asset = filterAssets()[index];
                    return (
                      <Box
                        style={style}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Asset
                          asset={asset}
                          setChoice={setChoice}
                          choice={choice}
                          select={select}
                          onClose={onClose}
                          addAssets={addAssets}
                        />
                      </Box>
                    );
                  }}
                </List>
              ) : (
                <Box
                  width="100%"
                  maxWidth={385}
                  height={200}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexDirection="column"
                  opacity="0.5"
                >
                  <Box height="2" />
                  <Text fontWeight="bold" color="GrayText">
                    No Assets
                  </Text>
                </Box>
              )
            ) : (
              <Box
                width="100%"
                maxWidth={385}
                height={200}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Spinner color="yellow" speed="0.5s" />
              </Box>
            )}
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

const Asset = ({ asset, choice, select, setChoice, onClose, addAssets }) => {
  const [token, setToken] = React.useState(null);
  const isMounted = useIsMounted();
  const hoverColor = useColorModeValue('blue.100', 'gray.900');

  const fetchData = async () => {
    const detailedAsset = {
      ...(await getAsset(asset.unit)),
      quantity: asset.quantity,
    };
    if (!isMounted.current) return;
    setToken(detailedAsset);
  };

  React.useEffect(() => {
    fetchData();
  }, []);

  return (
    <Button
      background={choice[asset.unit] && hoverColor}
      _hover={{
        bgBlendMode: false,
        bg: !choice[asset.unit] && hoverColor,
      }}
      width="96%"
      onClick={() => {
        if (select.current) {
          select.current = false;
          return;
        }
        onClose();
        addAssets([asset]);
      }}
      mr="3"
      ml="4"
      display="flex"
      alignItems="center"
      justifyContent="start"
      variant="ghost"
    >
      {token && (
        <Stack
          width="100%"
          fontSize="xs"
          direction="row"
          alignItems="center"
          justifyContent="start"
        >
          <Selection
            asset={asset}
            select={select}
            choice={choice}
            setChoice={setChoice}
          />

          <Box
            textAlign="left"
            width="200px"
            whiteSpace="nowrap"
            fontWeight="normal"
          >
            <Box mb="-1px">
              <MiddleEllipsis>
                <span>{token.name}</span>
              </MiddleEllipsis>
            </Box>
            <Box whiteSpace="nowrap" fontSize="xx-small" fontWeight="light">
              <MiddleEllipsis>
                <span>Policy: {token.policy}</span>
              </MiddleEllipsis>
            </Box>
          </Box>
          <Box>
            <UnitDisplay quantity={token.quantity} decimals={token.decimals} />
          </Box>
        </Stack>
      )}
    </Button>
  );
};

const Selection = ({ select, asset, choice, setChoice }) => {
  const selectColor = useColorModeValue('orange.500', 'orange.200');
  return (
    <Box
      rounded="full"
      width="6"
      height="6"
      overflow="hidden"
      onClick={() => (select.current = true)}
    >
      {choice[asset.unit] ? (
        <Box
          width="100%"
          height="100%"
          background={selectColor}
          display="flex"
          alignItems="center"
          justifyContent="center"
          color={selectColor === 'orange.200' ? 'black' : 'white'}
          onClick={(e) => {
            delete choice[asset.unit];
            setChoice({ ...choice });
          }}
        >
          <CheckIcon />
        </Box>
      ) : (
        <Avatar
          onClick={(e) => {
            choice[asset.unit] = true;
            setChoice({ ...choice });
          }}
          userSelect="none"
          size="xs"
          name={asset.name}
        />
      )}
    </Box>
  );
};

export default Send;
