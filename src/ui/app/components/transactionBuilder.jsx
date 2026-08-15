import React from 'react';
import {
  initTx,
  buildTx,
  signAndSubmit,
  withdrawalTx,
  signAndSubmitHW,
  undelegateTx,
} from '../../../api/extension/wallet';
import ConfirmModal from './confirmModal';
import UnitDisplay from './unitDisplay';
import {
  Box,
  Link,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Button,
  useToast,
  Icon,
  UnorderedList,
  ListItem,
} from '@chakra-ui/react';
import { GoStop } from 'react-icons/go';
import { ERROR, HW, TAB, submitErrorMessage } from '../../../config/config';
import { useStoreState } from 'easy-peasy';
import Loader from '../../../api/loader';
import {
  createTab,
  openKeystoneSignTxTab,
  paymentKeyHashesForSigning,
  getUtxos,
  removeCollateral,
  setCollateral,
  toUnit,
} from '../../../api/extension';
import { FaRegFileCode } from 'react-icons/fa';

const poolDefaultValue = {};

/** Payment (+ optional stake) key hashes covering all enabled addresses. */
async function signingKeyHashesForAccount(account, { includeStake = true } = {}) {
  const paymentHashes = await paymentKeyHashesForSigning(account);
  if (!includeStake) return paymentHashes;
  return [...paymentHashes, account?.stakeKeyHash].filter(Boolean);
}

const TransactionBuilder = React.forwardRef(({ onConfirm }, ref) => {
  const settings = useStoreState((state) => state.settings.settings);
  const toast = useToast();
  const {
    isOpen: isOpenCol,
    onOpen: onOpenCol,
    onClose: onCloseCol,
  } = useDisclosure();

  const [isLoading, setIsLoading] = React.useState(false);
  const [data, setData] = React.useState({
    fee: '',
    tx: null,
    account: null,
    stakeRegistration: '',
    rewards: '',
    ready: false,
    pool: { ...poolDefaultValue },
  });
  const COLLATERAL = '5';
  const withdrawRef = React.useRef();
  const undelegateRef = React.useRef();
  const collateralRef = React.useRef();

  React.useImperativeHandle(ref, () => ({
    async initWithdrawal(account, delegation) {
      setData({
        pool: { ...poolDefaultValue },
        fee: '',
        stakeRegistration: '',
        rewards: '',
        ready: false,
        error: '',
      });
      withdrawRef.current.openModal(account.index);
      const protocolParameters = await initTx();
      try {
        const utxos = await getUtxos();
        const tx = await withdrawalTx(account, delegation, protocolParameters, utxos);
        setData({
          pool: { ...poolDefaultValue },
          tx,
          account,
          rewards: delegation.rewards,
          fee: tx.body().fee().toString(),
          ready: true,
        });
      } catch (e) {
        console.warn(e);
        setData((d) => ({
          ...d,
          error: 'Transaction not possible (maybe reward amount too small)',
        }));
      }
    },
    async initUndelegate(account, delegation) {
      setData({
        pool: { ...poolDefaultValue },
        fee: '',
        stakeRegistration: '',
        rewards: '',
        ready: false,
        error: '',
      });
      undelegateRef.current.openModal(account.index);
      const protocolParameters = await initTx();
      try {
        const tx = await undelegateTx(account, delegation, protocolParameters);
        setData({
          pool: { ...poolDefaultValue },
          tx,
          account,
          fee: tx.body().fee().toString(),
          ready: true,
        });
      } catch (e) {
        setData((d) => ({
          ...d,
          error: 'Transaction not possible (maybe account balance too low)',
        }));
      }
    },
    async initCollateral(account) {
      setData({
        pool: { ...poolDefaultValue },
        fee: '',
        stakeRegistration: '',
        rewards: '',
        ready: false,
        error: '',
      });
      if (account.collateral) {
        onOpenCol();
        return;
      }
      collateralRef.current.openModal(account.index);
      const protocolParameters = await initTx();
      const utxos = await getUtxos();
      await Loader.load();
      const outputs = Loader.Cardano.TransactionOutputList.new();
      outputs.add(
        Loader.Cardano.TransactionOutput.new(
          Loader.Cardano.Address.from_bech32(account.paymentAddr),
          Loader.Cardano.Value.new_with_assets(
            Loader.Cardano.BigNum.from_str(String(toUnit(COLLATERAL))),
            Loader.Cardano.MultiAsset.new()
          )
        )
      );
      try {
        const tx = await buildTx(account, utxos, outputs, protocolParameters);
        setData({
          pool: { ...poolDefaultValue },
          tx,
          account,
          fee: tx.body().fee().toString(),
          ready: true,
        });
      } catch (e) {
        setData((d) => ({
          ...d,
          error: 'Transaction not possible (maybe insufficient balance)',
        }));
      }
    },
  }));

  return (
    <>
      <ConfirmModal
        sign={async (password, hw) => {
          const keyHashes = await signingKeyHashesForAccount(data.account, {
            includeStake: true,
          });
          if (hw) {
            if (hw.device === HW.trezor) {
              return createTab(
                TAB.trezorTx,
                `?tx=${Buffer.from(data.tx.to_bytes()).toString('hex')}`
              );
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex: Buffer.from(data.tx.to_bytes()).toString('hex'),
                keyHashes,
                partialSign: false,
              });
            }
            return await signAndSubmitHW(data.tx, {
              keyHashes,
              account: data.account,
              hw,
            });
          }
          return await signAndSubmit(
            data.tx,
            {
              keyHashes,
              accountIndex: data.account.index,
            },
            password
          );
        }}
        onConfirm={(status, signedTx) => {
          if (status === true)
            toast({
              title: 'Withdrawal submitted',
              status: 'success',
              duration: 4000,
            });
          else if (signedTx === ERROR.fullMempool) {
            toast({
              title: 'Withdrawal failed',
              description: 'Mempool full. Try again.',
              status: 'error',
              duration: 3000,
            });
          } else
            toast({
              title: 'Withdrawal failed',
              description: submitErrorMessage(signedTx),
              status: 'error',
              duration: 3000,
            });
          withdrawRef.current.closeModal();
        }}
        ready={data.ready}
        title="Withdraw Rewards"
        info={
          <Box
            width="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            {data.error ? (
              <Box textAlign="center" mb="4" color="red.300">
                {data.error}
              </Box>
            ) : (
              <Box fontSize="sm">
                <Box
                  mt="-2"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <UnitDisplay
                    fontSize="xl"
                    fontWeight="bold"
                    color="yellow.700"
                    hide
                    quantity={data.rewards}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                </Box>
                <Box h="3" />
                <Box display="flex" alignItems="center" justifyContent="center">
                  <Text fontWeight="bold">+ Fee:</Text>
                  <Box w="1" />
                  <UnitDisplay
                    quantity={data.fee}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                </Box>
                <Box h="4" />
              </Box>
            )}
          </Box>
        }
        ref={withdrawRef}
      />
      <ConfirmModal
        ready={data.ready}
        title="Stake deregistration"
        sign={async (password, hw) => {
          const keyHashes = await signingKeyHashesForAccount(data.account, {
            includeStake: true,
          });
          if (hw) {
            if (hw.device === HW.trezor) {
              return createTab(
                TAB.trezorTx,
                `?tx=${Buffer.from(data.tx.to_bytes()).toString('hex')}`
              );
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex: Buffer.from(data.tx.to_bytes()).toString('hex'),
                keyHashes,
                partialSign: false,
              });
            }
            return await signAndSubmitHW(data.tx, {
              keyHashes,
              account: data.account,
              hw,
            });
          }
          return await signAndSubmit(
            data.tx,
            {
              keyHashes,
              accountIndex: data.account.index,
            },
            password
          );
        }}
        onConfirm={(status, signedTx) => {
          if (status === true) {
            toast({
              title: 'Deregistration submitted',
              status: 'success',
              duration: 4000,
            });
          } else if (signedTx === ERROR.fullMempool) {
            toast({
              title: 'Transaction failed',
              description: 'Mempool full. Try again.',
              status: 'error',
              duration: 3000,
            });
          } else
            toast({
              title: 'Transaction failed',
              description: submitErrorMessage(signedTx),
              status: 'error',
              duration: 3000,
            });
          undelegateRef.current.closeModal();
        }}
        info={
          <Box
            width="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Icon as={GoStop} w={50} h={50} color="red.500" />
            <Box h="4" />
            <Text fontSize="sm">
              Going forward with deregistration will have the following effects:
            </Text>
            <UnorderedList mt="10px">
              <ListItem>You will no longer receive rewards.</ListItem>
              <ListItem>
                Rewards from the 2 previous epoch will be lost.
              </ListItem>
              <ListItem>Full reward balance will be withdrawn.</ListItem>
              <ListItem>The 2 ADA deposit will be refunded.</ListItem>
              <ListItem>
                You will have to re-register and wait 20 days to receive rewards
                again.
              </ListItem>
            </UnorderedList>
            <Box h="6" />
            {data.error ? (
              <Box textAlign="center" mb="4" color="red.300">
                {data.error}
              </Box>
            ) : (
              <Box fontSize="sm">
                <Box
                  mt="1"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontWeight="bold">+ Stake Deregistration</Text>
                </Box>
                <Box display="flex" alignItems="center" justifyContent="center">
                  <Text fontWeight="bold">+ Fee:</Text>
                  <Box w="1" />
                  <UnitDisplay
                    quantity={data.fee}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                </Box>
                <Box h="4" />
              </Box>
            )}
          </Box>
        }
        ref={undelegateRef}
      />
      <ConfirmModal
        ready={data.ready}
        title={
          <Box display="flex" alignItems="center">
            <Icon as={FaRegFileCode} mr="2" /> <Box>Collateral</Box>
          </Box>
        }
        sign={async (password, hw) => {
          const keyHashes = await signingKeyHashesForAccount(data.account, {
            includeStake: false,
          });
          if (hw) {
            if (hw.device === HW.trezor) {
              return createTab(
                TAB.trezorTx,
                `?tx=${Buffer.from(data.tx.to_bytes()).toString('hex')}`
              );
            }
            if (hw.device === HW.keystone) {
              return openKeystoneSignTxTab({
                txHex: Buffer.from(data.tx.to_bytes()).toString('hex'),
                keyHashes,
                partialSign: false,
              });
            }
            return await signAndSubmitHW(data.tx, {
              keyHashes,
              account: data.account,
              hw,
            });
          }
          return await signAndSubmit(
            data.tx,
            {
              keyHashes,
              accountIndex: data.account.index,
            },
            password
          );
        }}
        onCloseBtn={() => {
        }}
        onConfirm={async (status, signedTx) => {
          if (status === true) {
            await setCollateral({
              txHash: signedTx,
              txId: 0,
              lovelace: toUnit(COLLATERAL),
            });
            toast({
              title: 'Collateral added',
              status: 'success',
              duration: 4000,
            });
            onConfirm();
          } else if (signedTx === ERROR.fullMempool) {
            toast({
              title: 'Transaction failed',
              description: 'Mempool full. Try again.',
              status: 'error',
              duration: 3000,
            });
          } else
            toast({
              title: 'Transaction failed',
              description: submitErrorMessage(signedTx),
              status: 'error',
              duration: 3000,
            });
          collateralRef.current.closeModal();
        }}
        info={
          <Box
            width="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexDirection="column"
          >
            <Text fontSize="sm">
              Add collateral in order to interact with smart contracts on
              Cardano:
              <Box mt="3">The recommended collateral amount is</Box>
              <Box mb="3" width="full" textAlign="center">
                <b style={{ fontSize: 16 }}>5 {settings.adaSymbol}</b>
              </Box>{' '}
              The amount is separated from your account balance, you can choose
              to return it to your balance at any time.
              <br />
              <Link
                fontWeight="semibold"
                onClick={() => window.open('https://www.hodlerstaking.com/')}
              >
                Read more
              </Link>
            </Text>
            <Box h="6" />
            {data.error ? (
              <Box textAlign="center" mb="4" color="red.300">
                {data.error}
              </Box>
            ) : (
              <Box fontSize="sm">
                <Box display="flex" alignItems="center" justifyContent="center">
                  <Text fontWeight="bold">+ Fee:</Text>
                  <Box w="1" />
                  <UnitDisplay
                    quantity={data.fee}
                    decimals={6}
                    symbol={settings.adaSymbol}
                  />
                </Box>
                <Box h="4" />
              </Box>
            )}
          </Box>
        }
        ref={collateralRef}
      />

      <Modal size="xs" isCentered isOpen={isOpenCol} onClose={onCloseCol}>
        <ModalOverlay />
        <ModalContent >
          <ModalHeader fontSize="md">
            {' '}
            <Box display="flex" alignItems="center">
              <Icon as={FaRegFileCode} mr="2" /> <Box>Collateral</Box>
            </Box>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm">
              Your collateral amount is{' '}
              <b style={{ fontSize: 16 }}>5 {settings.adaSymbol}</b>.<br />
              <br /> When removing the collateral amount, it is returned to the
              account balance, but disables interactions with smart contracts.
            </Text>
            <Box h="6" />
            <Box h="3" />
            <Box
              width="100%"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
            >
              <Button
                isDisabled={isLoading}
                isLoading={isLoading}
                onClick={async () => {
                  setIsLoading(true);
                  await removeCollateral();
                  toast({
                    title: 'Collateral removed',
                    status: 'success',
                    duration: 4000,
                  });
                  onConfirm(true);
                  onCloseCol();
                  setIsLoading(false);
                }}
              >
                Remove
              </Button>

              <Box h="4" />
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
});

export default TransactionBuilder;
