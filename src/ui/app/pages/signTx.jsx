import React from 'react';
import platform from '../../../platform';
import {
  bytesAddressToBinary,
  extractKeyOrScriptHash,
  getCurrentAccount,
  getSpecificUtxo,
  getUtxos,
  isHW,
  signTx,
  signTxHW,
} from '../../../api/extension';
import Account from '../components/account';
import { Scrollbars } from '../components/scrollbar';
import ConfirmModal from '../components/confirmModal';
import Loader from '../../../api/loader';
import UnitDisplay from '../components/unitDisplay';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MiddleEllipsis from 'react-middle-ellipsis';
import AssetFingerprint from '@emurgo/cip14-js';
import Copy from '../components/copy';
import { valueToAssets } from '../../../api/util';
import { TxSignError } from '../../../config/config';
import { useStoreState } from 'easy-peasy';
import {
  Box,
  Flex,
  Stack,
  Text,
  Button,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalOverlay,
  Spinner,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import AssetsModal from '../components/assetsModal';
import InlineSignAction from '../components/inlineSignAction';
import { AnimatedQRCode, AnimatedQRScanner } from '@keystonehq/animated-qr';
import { URType } from '@keystonehq/keystone-sdk';
import KeystoneSDK from '@keystonehq/keystone-sdk';
import {
  assertKeystoneWitnessesCover,
  buildKeystoneCardanoSignRequest,
  formatKeystoneSubmitError,
  KEYSTONE_SIGN_ANIMATED_QR_OPTIONS,
  parseKeystoneCardanoTxSignature,
  spentPaymentKeyHashes,
  witnessSetHexFromKeystoneSignature,
} from '../../../api/keystone-cardano';
import { assembleSignedTransaction } from '../../../api/extension/wallet';
import { appendRequiredKeyHashesFromCerts } from '../../../api/tx/cert-required-key-hashes';
import useSurfaceColors from '../hooks/useSurfaceColors';
import {
  outputDatumHashHex,
  outputHasDatum,
  txBodyCollateral,
} from '../../../api/tx/csl-tx-accessors';

const KPhase = { load: 'load', show: 'show', scan: 'scan' };

const SignTxKeystoneInline = ({
  hw,
  txHex,
  keyHashes,
  account,
  onSuccess,
  onCancel,
}) => {
  const [phase, setPhase] = React.useState(KPhase.load);
  const [err, setErr] = React.useState('');
  const [urData, setUrData] = React.useState({ type: '', cbor: '' });
  const sdkRef = React.useRef(null);
  const txHexRef = React.useRef(txHex);

  React.useEffect(() => {
    txHexRef.current = txHex;
  }, [txHex]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Loader.load();
        const utxos = await getUtxos();
        const { ur, sdk } = await buildKeystoneCardanoSignRequest({
          txHex,
          account,
          hw,
          utxos,
          keyHashes,
        });
        if (cancelled) return;
        sdkRef.current = sdk;
        setUrData({
          type: ur.type,
          cbor: Buffer.from(ur.cbor).toString('hex'),
        });
        setPhase(KPhase.show);
      } catch (e) {
        if (!cancelled) {
          setErr(e.message || 'Could not build Keystone request');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hw, txHex, account, keyHashes]);

  const onSigScan = async ({ type, cbor }) => {
    try {
      const sdk = sdkRef.current || new KeystoneSDK();
      const sig = parseKeystoneCardanoTxSignature(sdk, { type, cbor });
      const wh = witnessSetHexFromKeystoneSignature(sig);
      if (!wh) throw new Error('Missing witness set');
      await Loader.load();
      const rawTx = Loader.Cardano.Transaction.from_bytes(
        Buffer.from(txHexRef.current, 'hex')
      );
      const witnessSet = Loader.Cardano.TransactionWitnessSet.from_bytes(
        Buffer.from(wh, 'hex')
      );
      const utxos = await getUtxos();
      assertKeystoneWitnessesCover(
        Loader.Cardano,
        rawTx,
        witnessSet,
        spentPaymentKeyHashes(Loader.Cardano, rawTx, account, utxos)
      );
      const merged = await assembleSignedTransaction(rawTx, witnessSet);
      onSuccess(merged);
    } catch (e) {
      setErr(formatKeystoneSubmitError(e) || 'Invalid signature QR');
    }
  };

  return (
    <Box color="white">
      {phase === KPhase.load && !err && (
        <Text textAlign="center">Preparing Keystone QR…</Text>
      )}
      {err && (
        <Text color="red.300" fontSize="sm">
          {err}
        </Text>
      )}
      {phase === KPhase.show && urData.cbor && (
        <>
          <Text fontSize="sm" mb={3}>
            Scan with Keystone. Frames are sparse and slow so the device camera
            can lock on. Approve, then tap below and scan the signature QR.
          </Text>
          <Box bg="white" p={2} rounded="md" mx="auto" w="fit-content">
            <AnimatedQRCode
              type={urData.type}
              cbor={urData.cbor}
              options={KEYSTONE_SIGN_ANIMATED_QR_OPTIONS}
            />
          </Box>
          <Button
            mt={4}
            colorScheme="cyan"
            w="full"
            onClick={() => setPhase(KPhase.scan)}
          >
            Scan signature from Keystone
          </Button>
        </>
      )}
      {phase === KPhase.scan && (
        <>
          <Text fontSize="xs" mb={2}>
            Allow camera access to scan the Keystone signature QR.
          </Text>
          <Box rounded="md" overflow="hidden" bg="blackAlpha.800">
            <AnimatedQRScanner
              urTypes={[URType.CardanoSignature]}
              handleScan={onSigScan}
              handleError={(m) => setErr(m)}
              options={{ width: '100%', height: 220 }}
            />
          </Box>
          <Button mt={3} variant="ghost" onClick={() => setPhase(KPhase.show)}>
            Back
          </Button>
        </>
      )}
      <Button mt={4} variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </Box>
  );
};

const abs = (big) => {
  return big < 0 ? big * BigInt(-1) : big;
};

const SignTx = ({ request, controller }) => {
  const settings = useStoreState((state) => state.settings.settings);
  const { pageBg, pageFg, mutedFg, subtleFg, cyanLink } = useSurfaceColors();
  const originHost = String(request.origin || '').replace(/^https?:\/\//, '');
  const ref = React.useRef();
  const [keystoneHw, setKeystoneHw] = React.useState(null);
  const [account, setAccount] = React.useState(null);
  const [fee, setFee] = React.useState('0');
  const [value, setValue] = React.useState({
    ownValue: null,
    externalValue: null,
  });
  const [property, setProperty] = React.useState({
    metadata: false,
    certificate: false,
    withdrawal: false,
    minting: false,
    script: false,
    contract: false,
    datum: false,
  });
  const [tx, setTx] = React.useState('');
  // key kind can be payment and stake
  const [keyHashes, setKeyHashes] = React.useState({ kind: [], key: [] });
  const [isLoading, setIsLoading] = React.useState({
    loading: true,
    error: null,
    warning: null
  });

  const assetsModalRef = React.useRef();
  const detailsModalRef = React.useRef();

  const getFee = (tx) => {
    const fee = tx.body().fee().toString();
    setFee(fee);
  };

  const getProperties = (tx) => {
    let metadata = tx.auxiliary_data() && tx.auxiliary_data().metadata();
    if (metadata) {
      const json = {};
      const keys = metadata.labels();
      for (let i = 0; i < keys.len(); i++) {
        const key = keys.get(i);
        json[key.toString()] = JSON.parse(
          Loader.Cardano.decode_metadatum_to_json_str(metadata.get(key), 1)
        );
      }
      metadata = json;
    }

    const certificate = tx.body().certs();
    const withdrawal = tx.body().withdrawals();
    const minting = tx.body().mint();
    const script = tx.witness_set().native_scripts();
    let datum;
    let contract = tx.body().script_data_hash();
    const outputs = tx.body().outputs();
    for (let i = 0; i < outputs.len(); i++) {
      const output = outputs.get(i);
      if (outputHasDatum(output)) {
        datum = true;
        const prefix = bytesAddressToBinary(output.address().to_bytes()).slice(
          0,
          4
        );
        // from cardano ledger specs; if any of these prefixes match then it means the payment credential is a script hash, so it's a contract address
        if (
          prefix == '0111' ||
          prefix == '0011' ||
          prefix == '0001' ||
          prefix == '0101'
        ) {
          contract = true;
        }
        break;
      }
    }

    setProperty({
      metadata,
      certificate,
      withdrawal,
      minting,
      contract,
      script,
      datum,
    });
  };

  const getValue = async (tx, utxos, account) => {
    let inputValue = Loader.Cardano.Value.new_with_assets(
      Loader.Cardano.BigNum.from_str('0'),
      Loader.Cardano.MultiAsset.new()
    );
    const inputs = tx.body().inputs();
    for (let i = 0; i < inputs.len(); i++) {
      const input = inputs.get(i);
      const inputTxHash = Buffer.from(
        input.transaction_id().to_bytes()
      ).toString('hex');
      const inputTxId = parseInt(input.index().toString());
      const utxo = utxos.find((utxo) => {
        const utxoTxHash = Buffer.from(
          utxo.input().transaction_id().to_bytes()
        ).toString('hex');
        const utxoTxId = parseInt(utxo.input().index().toString());
        return inputTxHash === utxoTxHash && inputTxId === utxoTxId;
      });
      if (utxo) {
        inputValue = inputValue.checked_add(utxo.output().amount());
      }
    }
    const outputs = tx.body().outputs();
    let ownOutputValue = Loader.Cardano.Value.new_with_assets(
      Loader.Cardano.BigNum.from_str('0'),
      Loader.Cardano.MultiAsset.new()
    );
    const externalOutputs = {};
    if (!outputs) return;
    for (let i = 0; i < outputs.len(); i++) {
      const output = outputs.get(i);
      const address = output.address().to_bech32();
      const hashBech32 = await extractKeyOrScriptHash(
        Buffer.from(output.address().to_bytes()).toString('hex')
      );
      // making sure funds at mangled addresses are also included
      if (hashBech32 === account.paymentKeyHashBech32) {
        //own
        ownOutputValue = ownOutputValue.checked_add(output.amount());
      } else {
        //external
        if (!externalOutputs[address]) {
          const multiAsset =
            output.amount().multiasset() || Loader.Cardano.MultiAsset.new();
          const value = Loader.Cardano.Value.new_with_assets(
            output.amount().coin(),
            multiAsset
          );
          externalOutputs[address] = { value };
        } else
          externalOutputs[address].value = externalOutputs[
            address
          ].value.checked_add(output.amount());
        const prefix = bytesAddressToBinary(output.address().to_bytes()).slice(
          0,
          4
        );
        // from cardano ledger specs; if any of these prefixes match then it means the payment credential is a script hash, so it's a contract address
        if (
          prefix == '0111' ||
          prefix == '0011' ||
          prefix == '0001' ||
          prefix == '0101'
        ) {
          externalOutputs[address].script = true;
        }
        const datumHash = outputDatumHashHex(output, Loader.Cardano);
        if (datumHash) externalOutputs[address].datumHash = datumHash;
      }
    }

    inputValue = await valueToAssets(inputValue);
    ownOutputValue = await valueToAssets(ownOutputValue);

    const involvedAssets = [
      ...new Set([
        ...inputValue.map((asset) => asset.unit),
        ...ownOutputValue.map((asset) => asset.unit),
      ]),
    ];
    const ownOutputValueDifference = involvedAssets.map((unit) => {
      const leftValue = inputValue.find((asset) => asset.unit === unit);
      const rightValue = ownOutputValue.find((asset) => asset.unit === unit);
      const difference =
        BigInt(leftValue ? leftValue.quantity : '') -
        BigInt(rightValue ? rightValue.quantity : '');
      if (unit === 'lovelace') {
        return { unit, quantity: difference };
      }
      const policy = unit.slice(0, 56);
      const name = unit.slice(56);
      const fingerprint = new AssetFingerprint(
        Buffer.from(policy, 'hex'),
        Buffer.from(name, 'hex')
      ).fingerprint();
      return {
        unit,
        quantity: difference,
        fingerprint,
        name: (leftValue || rightValue).name,
        policy,
      };
    });

    const externalValue = {};
    for (const address of Object.keys(externalOutputs)) {
      externalValue[address] = {
        ...externalOutputs[address],
        value: await valueToAssets(externalOutputs[address].value),
      };
    }

    const ownValue = ownOutputValueDifference.filter((v) => v.quantity != 0);
    setValue({ ownValue, externalValue });
  };

  const getPaymentKeyHash = async (address) => {
    try {
      return Buffer.from(
        Loader.Cardano.BaseAddress.from_address(
          Loader.Cardano.Address.from_bytes(address.to_bytes())
        )
          .payment_cred()
          .to_keyhash()
          .to_bytes()
      ).toString('hex');
    } catch (e) {}
    try {
      return Buffer.from(
        Loader.Cardano.EnterpriseAddress.from_address(
          Loader.Cardano.Address.from_bytes(address.to_bytes())
        )
          .payment_cred()
          .to_keyhash()
          .to_bytes()
      ).toString('hex');
    } catch (e) {}
    try {
      return Buffer.from(
        Loader.Cardano.PointerAddress.from_address(
          Loader.Cardano.Address.from_bytes(address.to_bytes())
        )
          .payment_cred()
          .to_keyhash()
          .to_bytes()
      ).toString('hex');
    } catch (e) {}
    throw Error('Not supported address type');
  };

  const getKeyHashes = async (tx, utxos, account) => {
    let requiredKeyHashes = [];
    const baseAddr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bech32(account.paymentAddr)
    );
    const paymentKeyHash = Buffer.from(
      baseAddr.payment_cred().to_keyhash().to_bytes()
    ).toString('hex');
    const stakeKeyHash = Buffer.from(
      baseAddr.stake_cred().to_keyhash().to_bytes()
    ).toString('hex');
    const drepKeyHash = account.publicKey
      ? Buffer.from(
          Loader.Cardano.Bip32PublicKey.from_hex(account.publicKey)
            .derive(3)
            .derive(0)
            .to_raw_key()
            .hash()
            .to_bytes()
        ).toString('hex')
      : null;

    //get key hashes from inputs
    const inputs = tx.body().inputs();
    for (let i = 0; i < inputs.len(); i++) {
      const input = inputs.get(i);
      const txHash = Buffer.from(input.transaction_id().to_bytes()).toString(
        'hex'
      );
      const index = parseInt(input.index().toString());
      if (
        utxos.some(
          (utxo) =>
            Buffer.from(utxo.input().transaction_id().to_bytes()).toString(
              'hex'
            ) === txHash && parseInt(utxo.input().index().toString()) === index
        )
      ) {
        requiredKeyHashes.push(paymentKeyHash);
      } else {
        requiredKeyHashes.push('<not_owned_key_hash>');
      }
    }

    const txBody = tx.body();
    if (txBody.certs()) {
      appendRequiredKeyHashesFromCerts(txBody.certs(), requiredKeyHashes);
    }

    // key hashes from withdrawals
    const withdrawals = txBody.withdrawals();
    const keyHashFromWithdrawal = (withdrawals) => {
      const rewardAddresses = withdrawals.keys();
      for (let i = 0; i < rewardAddresses.len(); i++) {
        const credential = rewardAddresses.get(i).payment_cred();
        if (credential.kind() === 0) {
          requiredKeyHashes.push(credential.to_keyhash().to_hex());
        }
      }
    };
    if (withdrawals) keyHashFromWithdrawal(withdrawals);

    //get key hashes from scripts
    const scripts = tx.witness_set().native_scripts();
    const keyHashFromScript = (scripts) => {
      for (let i = 0; i < scripts.len(); i++) {
        const script = scripts.get(i);
        if (script.kind() === 0) {
          const keyHash = Buffer.from(
            script.as_script_pubkey().ed25519_key_hash().to_bytes()
          ).toString('hex');
          requiredKeyHashes.push(keyHash);
        }
        if (script.kind() === 1) {
          return keyHashFromScript(script.as_script_all().native_scripts());
        }
        if (script.kind() === 2) {
          return keyHashFromScript(script.as_script_any().native_scripts());
        }
        if (script.kind() === 3) {
          return keyHashFromScript(script.as_script_n_of_k().native_scripts());
        }
      }
    };
    if (scripts) keyHashFromScript(scripts);

    //get keyHashes from required signers
    const requiredSigners = tx.body().required_signers();
    if (requiredSigners) {
      for (let i = 0; i < requiredSigners.len(); i++) {
        requiredKeyHashes.push(
          Buffer.from(requiredSigners.get(i).to_bytes()).toString('hex')
        );
      }
    }

    //get keyHashes from collateral
    const collateral = txBodyCollateral(txBody);
    if (collateral) {
      for (let i = 0; i < collateral.len(); i++) {
        const c = collateral.get(i);
        const utxo = await getSpecificUtxo(
          Buffer.from(c.transaction_id().to_bytes()).toString('hex'),
          c.index()
        );
        if (utxo) {
          const address = Loader.Cardano.Address.from_bech32(utxo.address);
          requiredKeyHashes.push(await getPaymentKeyHash(address));
        }
      }
    }

    const keyKind = [];
    requiredKeyHashes = [...new Set(requiredKeyHashes)];
    if (requiredKeyHashes.includes(paymentKeyHash)) keyKind.push('payment');
    if (requiredKeyHashes.includes(stakeKeyHash)) keyKind.push('stake');
    if (drepKeyHash && requiredKeyHashes.includes(drepKeyHash)) keyKind.push('drep');
    if (keyKind.length <= 0) {
      setIsLoading((l) => ({
        ...l,
        error: 'Signature not possible',
      }));
      return;
    }
    setKeyHashes({ key: requiredKeyHashes, kind: keyKind });
  };

  const checkCollateral = (tx, utxos, account) => {
    const collateralInputs = txBodyCollateral(tx.body());
    if (!collateralInputs) return;

    const collateralReturn = tx.body().collateral_return();
    // CIP-40: collateral return lets builders use any UTxO safely.
    if (collateralReturn) {
      if (collateralReturn.address().to_bech32() !== account.paymentAddr) {
        setIsLoading((l) => ({
          ...l,
          warning:
            'Collateral return is being directed to another owner. Ensure you are not providing the collateral input',
        }));
      }
      return;
    }

    for (let i = 0; i < collateralInputs.len(); i++) {
      const collInput = collateralInputs.get(i);
      const collHash = Buffer.from(
        collInput.transaction_id().to_bytes()
      ).toString('hex');
      const collIndex = collInput.index();

      const isReserved =
        !!account.collateral &&
        account.collateral.txHash === collHash &&
        Number(account.collateral.txId) === Number(collIndex);

      // Reserved collateral is excluded from getUtxos(); still allow it.
      if (isReserved) continue;

      let matched = null;
      for (let j = 0; j < utxos.length; j++) {
        const input = utxos[j].input();
        if (
          Buffer.from(input.transaction_id().to_bytes()).toString('hex') ===
            collHash &&
          input.index() === collIndex
        ) {
          matched = utxos[j];
          break;
        }
      }

      // Not one of our spendable UTxOs — dApp-supplied collateral; do not block.
      if (!matched) continue;

      const amount = matched.output().amount();
      const coin = BigInt(amount.coin().to_str());
      const ma = amount.multiasset();
      const pureAda = !ma || ma.len() === 0;
      // Small pure-ADA UTxO is fine without a reserved collateral slot.
      if (pureAda && coin <= BigInt('50000000')) continue;

      if (!account.collateral) {
        setIsLoading((l) => ({ ...l, error: 'Collateral not set' }));
        return;
      }
      setIsLoading((l) => ({ ...l, error: 'Invalid collateral used' }));
      return;
    }
  };

  const getInfo = async () => {
    try {
      await Loader.load();
      const currentAccount = await getCurrentAccount();
      setAccount(currentAccount);
      let utxos = await getUtxos();
      const txHex = String(request.data.tx || '').replace(/^0x/i, '');
      const tx = Loader.Cardano.Transaction.from_hex(txHex);
      setTx(txHex);
      getFee(tx);
      await getValue(tx, utxos, currentAccount);
      checkCollateral(tx, utxos, currentAccount);
      await getKeyHashes(tx, utxos, currentAccount);
      getProperties(tx);
      setIsLoading((l) => ({ ...l, loading: false }));
    } catch (e) {
      setIsLoading((l) => ({
        ...l,
        loading: false,
        error:
          e?.info ||
          e?.message ||
          'Could not decode this dApp transaction',
      }));
    }
  };
  const txFlags = [
    property.certificate && 'Certificate',
    property.withdrawal && 'Withdrawal',
    property.minting && 'Minting',
    property.script && 'Script',
    property.contract && 'Contract',
    property.datum && 'Datum',
    property.metadata && 'Metadata',
  ].filter(Boolean);

  const declineRequest = async () => {
    await controller.returnData({
      error: TxSignError.UserDeclined,
    });
    window.close();
  };

  const returnSignedTx = async (signedTx) => {
    await controller.returnData({
      data: Buffer.from(signedTx.to_bytes()).toString('hex'),
    });
    window.close();
  };

  const returnSignError = async (error) => {
    await controller.returnData({ error });
    window.close();
  };

  React.useEffect(() => {
    getInfo();
  }, []);

  const shellProps = {
    'data-testid': 'sign-tx-page',
    h: '100%',
    maxH: '100%',
    minH: 0,
    display: 'flex',
    alignItems: 'stretch',
    flexDirection: 'column',
    position: 'relative',
    w: 'full',
    maxW: '100%',
    bg: pageBg,
    color: pageFg,
    overflow: 'hidden',
    className: 'lucem-wallet-main-column lucem-settings-shell lucem-sign-page',
  };

  return (
    <>
      {isLoading.loading ? (
        <Box {...shellProps}>
          <Flex
            flex="1"
            minH={0}
            width="full"
            align="center"
            justify="center"
            direction="column"
            gap={3}
          >
            <Spinner color="yellow.400" speed="0.5s" />
            <Text fontSize="sm" color={mutedFg}>
              Reading transaction…
            </Text>
          </Flex>
        </Box>
      ) : !account ? (
        <Box {...shellProps}>
          <Flex
            flex="1"
            minH={0}
            direction="column"
            align="center"
            justify="center"
            px={6}
            gap={4}
          >
            <Text color="red.300" textAlign="center">
              {isLoading.error || 'Could not load this transaction'}
            </Text>
            <Button
              height="52px"
              px={8}
              rounded="2xl"
              variant="outline"
              color={pageFg}
              borderColor="whiteAlpha.300"
              onClick={declineRequest}
            >
              Cancel
            </Button>
          </Flex>
        </Box>
      ) : (
        <Box {...shellProps}>
          <Account background={pageBg} shadow="none" />
          <Box
            data-testid="sign-tx-form-scroll"
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
                data-testid="sign-tx-origin"
                className="lucem-sign-origin"
                align="center"
                justify="center"
                gap={2}
                px={3}
                py={1.5}
                maxW="full"
              >
                <Image
                  draggable={false}
                  boxSize={5}
                  rounded="md"
                  alt=""
                  src={platform.icons.getFaviconUrl(request.origin)}
                />
                <Text fontSize="sm" fontWeight="semibold" isTruncated maxW="220px">
                  {originHost}
                </Text>
              </Flex>
              <Box textAlign="center">
                <Text
                  data-testid="sign-tx-page-title"
                  fontSize="xl"
                  fontWeight="bold"
                  letterSpacing="tight"
                >
                  Sign transaction
                </Text>
                <Text mt={1} fontSize="sm" color={mutedFg}>
                  Review this request, then sign or cancel.
                </Text>
              </Box>
              <Box
                data-testid="sign-tx-amount-card"
                className="lucem-inset-surface lucem-sign-hero"
                rounded="3xl"
                w="full"
                px={6}
                py={8}
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexDirection="column"
              >
                {value.ownValue ? (
                  (() => {
                    let lovelace = value.ownValue.find(
                      (v) => v.unit === 'lovelace'
                    );
                    lovelace = lovelace ? lovelace.quantity : '0';
                    const assets = value.ownValue.filter(
                      (v) => v.unit !== 'lovelace'
                    );
                    const receiving = lovelace <= 0;
                    return (
                      <>
                        <Text
                          fontSize="xs"
                          fontWeight="semibold"
                          letterSpacing="0.16em"
                          textTransform="uppercase"
                          color={subtleFg}
                          mb={3}
                        >
                          {receiving ? 'Wallet receives' : 'Wallet spends'}
                        </Text>
                        <Stack
                          className={
                            receiving
                              ? 'lucem-sign-amount lucem-sign-amount-in'
                              : 'lucem-sign-amount lucem-sign-amount-out'
                          }
                          direction="row"
                          alignItems="center"
                          justifyContent="center"
                          fontSize={
                            lovelace.toString().length < 14 ? '4xl' : '3xl'
                          }
                          fontWeight="black"
                          lineHeight="1"
                        >
                          <Text>{receiving ? '+' : '−'}</Text>
                          <UnitDisplay
                            hide
                            quantity={abs(lovelace)}
                            decimals="6"
                            symbol={settings.adaSymbol}
                          />
                        </Stack>
                        {assets.length > 0 && (
                          <Box
                            mt={4}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                          >
                            {(() => {
                              const positiveAssets = assets.filter(
                                (v) => v.quantity < 0
                              );
                              const negativeAssets = assets.filter(
                                (v) => v.quantity > 0
                              );
                              return (
                                <Flex align="center" justify="center" gap={2}>
                                  {negativeAssets.length > 0 && (
                                    <Button
                                      className="lucem-sign-asset lucem-sign-asset-out"
                                      size="sm"
                                      rounded="full"
                                      onClick={() =>
                                        assetsModalRef.current.openModal({
                                          background: 'red.400',
                                          color: 'white',
                                          assets: negativeAssets,
                                          title: (
                                            <Box>
                                              Sending{' '}
                                              <Box as="span" color="red.400">
                                                {negativeAssets.length}
                                              </Box>{' '}
                                              {negativeAssets.length == 1
                                                ? 'asset'
                                                : 'assets'}
                                            </Box>
                                          ),
                                        })
                                      }
                                    >
                                      − {negativeAssets.length}{' '}
                                      {negativeAssets.length > 1
                                        ? 'assets'
                                        : 'asset'}
                                    </Button>
                                  )}
                                  {positiveAssets.length > 0 && (
                                    <Button
                                      className="lucem-sign-asset lucem-sign-asset-in"
                                      size="sm"
                                      rounded="full"
                                      onClick={() =>
                                        assetsModalRef.current.openModal({
                                          background: 'yellow.400',
                                          color: 'white',
                                          assets: positiveAssets,
                                          title: (
                                            <Box>
                                              Receiving{' '}
                                              <Box as="span" color="yellow.400">
                                                {positiveAssets.length}
                                              </Box>{' '}
                                              {positiveAssets.length == 1
                                                ? 'asset'
                                                : 'assets'}
                                            </Box>
                                          ),
                                        })
                                      }
                                    >
                                      + {positiveAssets.length}{' '}
                                      {positiveAssets.length > 1
                                        ? 'assets'
                                        : 'asset'}
                                    </Button>
                                  )}
                                </Flex>
                              );
                            })()}
                          </Box>
                        )}
                        <Flex
                          data-testid="sign-tx-fee"
                          justify="space-between"
                          w="full"
                          mt={6}
                          pt={4}
                          borderTopWidth="1px"
                          borderTopColor="whiteAlpha.100"
                          fontSize="sm"
                          color={mutedFg}
                        >
                          <Text>Network fee</Text>
                          <UnitDisplay
                            quantity={fee}
                            decimals="6"
                            symbol={settings.adaSymbol}
                            fontWeight="semibold"
                            color={pageFg}
                          />
                        </Flex>
                      </>
                    );
                  })()
                ) : (
                  <Text fontSize="2xl" fontWeight="bold" color={mutedFg}>
                    …
                  </Text>
                )}
              </Box>
              {(txFlags.length > 0 || keyHashes.kind.length > 0) && (
                <Flex
                  data-testid="sign-tx-flags"
                  wrap="wrap"
                  justify="center"
                  gap={2}
                >
                  {keyHashes.kind.map((kind) => (
                    <Box key={`key-${kind}`} className="lucem-sign-chip">
                      {kind} key
                    </Box>
                  ))}
                  {txFlags.map((flag) => (
                    <Box key={flag} className="lucem-sign-chip">
                      {flag}
                    </Box>
                  ))}
                </Flex>
              )}
              <Button
                data-testid="sign-tx-details"
                variant="ghost"
                size="sm"
                color={cyanLink}
                rightIcon={<ChevronRightIcon />}
                onClick={() => detailsModalRef.current.openModal()}
              >
                Details
              </Button>
            </Stack>
          </Box>

          <Box
            className="lucem-sign-footer"
            data-testid="sign-tx-footer"
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
              {isLoading.warning && (
                <Text
                  fontSize="xs"
                  color="orange.300"
                  textAlign="center"
                  px={2}
                >
                  Warning — {isLoading.warning}
                </Text>
              )}
              {isLoading.error && (
                <Text fontSize="xs" color="red.300" textAlign="center" px={2}>
                  {isLoading.error}
                </Text>
              )}
              <InlineSignAction
                testId="sign-tx"
                label="Sign"
                isHw={isHW(account.index)}
                isDisabled={isLoading.loading || Boolean(isLoading.error)}
                sign={(password) =>
                  signTx(
                    request.data.tx,
                    keyHashes.key,
                    password,
                    account.index,
                    request.data.partialSign
                  )
                }
                onSigned={returnSignedTx}
                onFailed={returnSignError}
                onHwRequest={() => ref.current.openModal(account.index)}
                onCancel={declineRequest}
              />
            </Stack>
          </Box>
        </Box>
      )}
      <AssetsModal ref={assetsModalRef} />
      <DetailsModal
        ref={detailsModalRef}
        externalValue={value.externalValue ? value.externalValue : {}}
        settings={settings}
        assetsModalRef={assetsModalRef}
        property={property}
        keyHashes={keyHashes}
        tx={tx}
      />
      <ConfirmModal
        ref={ref}
        onHwKeystone={(hwParsed) => setKeystoneHw(hwParsed)}
        onCloseBtn={() => {
        }}
        sign={async (password, hw) => {
          if (hw) {
            return await signTxHW(
              request.data.tx,
              keyHashes.key,
              account,
              hw,
              request.data.partialSign
            );
          }
          return await signTx(
            request.data.tx,
            keyHashes.key,
            password,
            account.index,
            request.data.partialSign
          );
        }}
        onConfirm={async (status, signedTx) =>
          status === true
            ? returnSignedTx(signedTx)
            : returnSignError(signedTx)
        }
      />
      <Modal
        isOpen={!!keystoneHw}
        onClose={() => setKeystoneHw(null)}
        size="full"
      >
        <ModalOverlay />
        <ModalContent className="lucem-sign-sheet" bg="gray.900">
          <ModalHeader color="white">Sign with Keystone</ModalHeader>
          <ModalCloseButton color="white" />
          <ModalBody pb={8} flex="1" minH={0} overflowY="auto">
            {keystoneHw && account && (
              <SignTxKeystoneInline
                hw={keystoneHw}
                txHex={request.data.tx}
                keyHashes={keyHashes.key}
                account={account}
                onSuccess={(merged) => {
                  controller.returnData({
                    data: Buffer.from(merged.to_bytes()).toString('hex'),
                  });
                  window.close();
                }}
                onCancel={() => setKeystoneHw(null)}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

const DetailsModal = React.forwardRef(
  (
    { externalValue, settings, property, keyHashes, tx, assetsModalRef },
    ref
  ) => {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { pageBg, insetBg } = useSurfaceColors();
    const background = pageBg;
    const innerBackground = insetBg;

    React.useImperativeHandle(ref, () => ({
      openModal() {
        onOpen();
      },
    }));
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="full">
        <ModalContent className="lucem-sign-sheet" background={background}>
          <ModalBody
            p={0}
            flex="1"
            minH={0}
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <Box
              flex="1"
              minH={0}
              overflowY="auto"
              w="full"
              sx={{ WebkitOverflowScrolling: 'touch' }}
            >
              <Box
                width={'full'}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                flexDirection={'column'}
              >
                <Box h={8} />
                <Box
                  fontSize={'xl'}
                  fontWeight={'bold'}
                  textAlign={'center'}
                >
                  Details
                </Box>
                <Box h={6} />
                <Box
                  width={'full'}
                  px={8}
                  display={'flex'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  flexDirection={'column'}
                >
                  {' '}
                  {Object.keys(externalValue).length > 0 && (
                    <Box width={'full'}>
                      <Text fontSize="md" fontWeight={'bold'}>
                        Recipients
                      </Text>
                      <Box height="4" />
                      {Object.keys(externalValue).map((address, index) => {
                        const lovelace = externalValue[address].value.find(
                          (v) => v.unit === 'lovelace'
                        ).quantity;
                        const assets = externalValue[address].value.filter(
                          (v) => v.unit !== 'lovelace'
                        );
                        return (
                          <Box key={index} mb="6">
                            <Stack direction="row" alignItems="center">
                              <Box
                                position={'relative'}
                                background={innerBackground}
                                rounded={'xl'}
                                p={2}
                              >
                                <Copy label="Copied address" copy={address}>
                                  <Box
                                    width={{ base: '160px', md: '220px' }}
                                    whiteSpace="nowrap"
                                    fontWeight="normal"
                                    textAlign={'center'}
                                    display={'flex'}
                                    alignItems={'center'}
                                    justifyContent={'center'}
                                    flexDirection={'column'}
                                  >
                                    <MiddleEllipsis>
                                      <span style={{ cursor: 'pointer' }}>
                                        {address}
                                      </span>
                                    </MiddleEllipsis>
                                  </Box>
                                </Copy>
                                {externalValue[address].script && (
                                  <Box
                                    position={'absolute'}
                                    bottom={-2}
                                    left={4}
                                    background={innerBackground}
                                    mt={1}
                                    rounded="full"
                                    px={1}
                                    fontSize={'xs'}
                                    color={'orange'}
                                    fontWeight={'medium'}
                                  >
                                    {externalValue[address].datumHash ? (
                                      <Copy
                                        label="Copied datum hash"
                                        copy={externalValue[address].datumHash}
                                      >
                                        Contract
                                      </Copy>
                                    ) : (
                                      'Script'
                                    )}
                                  </Box>
                                )}
                              </Box>
                              <Box
                                textAlign="center"
                                width={{ base: '160px', md: '220px' }}
                                display={'flex'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                flexDirection={'column'}
                              >
                                <UnitDisplay
                                  hide
                                  fontSize={'sm'}
                                  fontWeight="bold"
                                  quantity={lovelace}
                                  decimals="6"
                                  symbol={settings.adaSymbol}
                                />
                                {assets.length > 0 && (
                                  <Button
                                    mt={1}
                                    size={'xs'}
                                    onClick={() =>
                                      assetsModalRef.current.openModal({
                                        assets: assets,
                                        title: (
                                          <Box>
                                            Address receiving{' '}
                                            <Box as={'span'}>
                                              {assets.length}
                                            </Box>{' '}
                                            {assets.length == 1
                                              ? 'asset'
                                              : 'assets'}
                                          </Box>
                                        ),
                                      })
                                    }
                                  >
                                    + {assets.length}{' '}
                                    {assets.length > 1 ? 'Assets' : 'Asset'}
                                  </Button>
                                )}
                              </Box>
                            </Stack>
                          </Box>
                        );
                      })}
                      <Box h={4} />
                    </Box>
                  )}
                  {property.metadata && (
                    <>
                      <Text width={'full'} fontSize="md" fontWeight={'bold'}>
                        Metadata
                      </Text>
                      <Box height="4" />
                      <Box
                        padding="2.5"
                        rounded={'xl'}
                        width={'full'}
                        height={{ base: '200px', md: '260px' }}
                        background={innerBackground}
                      >
                        <Scrollbars autoHide>
                          <pre>
                            <code>
                              {JSON.stringify(property.metadata, null, 2)}
                            </code>
                          </pre>
                        </Scrollbars>
                      </Box>
                      <Box h={10} />
                    </>
                  )}
                  <Box fontSize="md" fontWeight={'bold'} width={'full'}>
                    Signing keys
                  </Box>
                  <Box height="4" />
                  <Box width={'full'} display={'flex'}>
                    {keyHashes.kind.map((keyHash, index) => (
                      <Box
                        mr={2}
                        py={1}
                        px={2}
                        background={innerBackground}
                        rounded={'full'}
                        key={index}
                      >
                        <Box
                          as={'b'}
                          color={keyHash == 'payment' ? 'yellow.400' : 'orange'}
                        >
                          {keyHash}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  <Box h={10} />
                  {Object.keys(property).some((key) => property[key]) && (
                    <>
                      <Box fontSize="md" fontWeight={'bold'} width={'full'}>
                        Tags
                      </Box>
                      <Box height="4" />
                      <Box width={'full'} display={'flex'} flexWrap={'wrap'}>
                        {Object.keys(property)
                          .filter((p) => property[p])
                          .map((p, index) => (
                            <Box
                              mb={2}
                              mr={2}
                              py={1}
                              px={2}
                              background={innerBackground}
                              rounded={'full'}
                              key={index}
                            >
                              <Box as={'b'}>
                                {p == 'minting' && 'Minting'}
                                {p == 'certificate' && 'Certificate'}
                                {p == 'withdrawal' && 'Withdrawal'}
                                {p == 'metadata' && 'Metadata'}
                                {p == 'contract' && 'Contract'}
                                {p == 'script' && 'Script'}
                                {p == 'datum' && 'Datum'}
                              </Box>
                            </Box>
                          ))}
                      </Box>
                      <Box h={10} />
                    </>
                  )}
                  <Box h={5} />
                  <Text width={'full'} fontSize="md" fontWeight={'bold'}>
                    Raw transaction
                  </Text>
                  <Box height="4" />
                  <Box
                    padding="2.5"
                    rounded={'xl'}
                    width={'full'}
                    height={{ base: '200px', md: '260px' }}
                    background={innerBackground}
                  >
                    <Scrollbars autoHide>{tx}</Scrollbars>
                  </Box>
                  <Box h={10} />
                </Box>
              </Box>
            </Box>
            <Flex
              flexShrink={0}
              w="full"
              py={4}
              pb="calc(1rem + env(safe-area-inset-bottom, 0px))"
              borderTopWidth="1px"
              borderTopColor="whiteAlpha.200"
              background={background}
              align="center"
              justify="center"
            >
              <Button onClick={onClose} width="180px" maxW="calc(100% - 2rem)">
                Back
              </Button>
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }
);

export default SignTx;
