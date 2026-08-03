import React from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  Icon,
  Stack,
  Text,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { CheckIcon, DeleteIcon } from '@chakra-ui/icons';
import { FaRegFileCode } from 'react-icons/fa';
import { useStoreState } from 'easy-peasy';
import {
  deleteAccount,
  getAccounts,
  getCurrentAccountIndex,
  getNativeAccounts,
  isHW,
  onAccountChange,
  switchAccount,
} from '../../../api/extension';
import { bigIntLovelace } from '../../../api/lovelace-scalar';
import AvatarLoader from '../components/avatarLoader';
import UnitDisplay from '../components/unitDisplay';
import About from '../components/about';
import TransactionBuilder from '../components/transactionBuilder';
import { WalletSetupButtons } from '../components/walletSetupFlow';
import useSurfaceColors from '../hooks/useSurfaceColors';
import { isSameAccountIndex } from '../utils/accountIndex';

/** Bottom clearance so list content sits above fixed trays. */
const TRAY_CLEARANCE_PB =
  'calc(6.5rem + env(safe-area-inset-bottom, 0px))';

const Accounts = () => {
  const settings = useStoreState((state) => state.settings.settings);
  const aboutRef = React.useRef();
  const deleteAccountRef = React.useRef();
  const builderRef = React.useRef();

  const { pageBg, pageFg, cardBg, cardHoverBg, mutedFg } = useSurfaceColors();
  const currentAccent = useColorModeValue('orange.600', 'orange.300');
  const currentRowBg = useColorModeValue(
    'rgba(234, 136, 0, 0.14)',
    'rgba(255, 140, 0, 0.18)'
  );
  const currentRowHoverBg = useColorModeValue(
    'rgba(234, 136, 0, 0.2)',
    'rgba(255, 140, 0, 0.26)'
  );

  const [currentIndex, setCurrentIndex] = React.useState(null);
  const [accountsMeta, setAccountsMeta] = React.useState({});
  const [accountsLive, setAccountsLive] = React.useState(null);
  const [busyIndex, setBusyIndex] = React.useState(null);

  const load = React.useCallback(async () => {
    const index = await getCurrentAccountIndex();
    const all = await getAccounts();
    setCurrentIndex(index);
    setAccountsMeta(all || {});
    setAccountsLive(all || {});
  }, []);

  React.useEffect(() => {
    load();
    const handler = onAccountChange(() => load());
    return () => handler && handler.remove();
  }, [load, settings.network?.id]);

  const currentAccount = accountsLive && currentIndex != null
    ? accountsLive[currentIndex]
    : null;

  const canDelete =
    currentAccount &&
    accountsLive &&
    (isHW(currentAccount.index) ||
      currentAccount.index >=
        Object.keys(getNativeAccounts(accountsLive)).length - 1) &&
    Object.keys(accountsLive).length > 1;

  return (
    <Box
      minH="100vh"
      sx={{ '@supports (height: 100dvh)': { minHeight: '100dvh' } }}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      position="relative"
      w="full"
      maxW="100%"
      bg={pageBg}
      color={pageFg}
      className="lucem-wallet-main-column"
      data-testid="accounts-page"
    >
      <Flex align="center" px={{ base: 4, md: 6 }} pt={4} pb={2}>
        <Text
          flex="1"
          textAlign="center"
          fontSize="xl"
          fontWeight="bold"
          color={pageFg}
        >
          Accounts
        </Text>
      </Flex>

      <Box
        flex="1"
        minH={0}
        overflowY="auto"
        w="full"
        px={{ base: 4, md: 6 }}
        pb={TRAY_CLEARANCE_PB}
      >
        <Stack spacing={4} w="full" maxW="sm" mx="auto" pt={1}>
          <Box
            className="lucem-inset-surface"
            rounded="3xl"
            p={{ base: 4, md: 5 }}
            data-testid="accounts-list-panel"
          >
            <Text fontSize="sm" color={mutedFg} mb={3}>
              Switch the active account. Create, import, or connect hardware to
              add another wallet.
            </Text>

            <Stack spacing={2}>
              {Object.keys(accountsMeta).map((accountIndex) => {
                const accountInfo = accountsMeta[accountIndex];
                const account = accountsLive && accountsLive[accountIndex];
                const accountKey =
                  accountInfo?.index != null ? accountInfo.index : accountIndex;
                const isCurrent = isSameAccountIndex(currentIndex, accountKey);
                const networkSlice =
                  account && settings.network?.id
                    ? account[settings.network.id]
                    : null;

                return (
                  <Button
                    key={accountIndex}
                    className={`lucem-inset-row${isCurrent ? ' is-current' : ''}`}
                    variant="unstyled"
                    h="auto"
                    py={3}
                    px={3}
                    rounded="2xl"
                    bg={isCurrent ? currentRowBg : cardBg}
                    _hover={{
                      bg: isCurrent ? currentRowHoverBg : cardHoverBg,
                      transform: 'translateY(-1px)',
                    }}
                    isDisabled={busyIndex != null}
                    isLoading={isSameAccountIndex(busyIndex, accountKey)}
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-label={
                      isCurrent
                        ? `${accountInfo.name}, selected`
                        : `Switch to ${accountInfo.name}`
                    }
                    onClick={async () => {
                      if (isCurrent || busyIndex != null) return;
                      setBusyIndex(accountKey);
                      try {
                        // Prefer typed account.index (number for seed accounts)
                        // so storage stays consistent for later lookups.
                        await switchAccount(accountKey);
                        await load();
                      } catch (e) {
                        console.error('Switch account failed', e);
                      } finally {
                        setBusyIndex(null);
                      }
                    }}
                    data-testid={`accounts-row-${accountIndex}`}
                    data-selected={isCurrent ? 'true' : undefined}
                  >
                    <Stack direction="row" alignItems="center" width="full">
                      <Box
                        width="36px"
                        height="36px"
                        mr={2}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                      >
                        <AvatarLoader
                          avatar={accountInfo.avatar}
                          width="36px"
                        />
                      </Box>
                      <Box
                        display="flex"
                        flexDirection="column"
                        flex="1"
                        minW={0}
                      >
                        <Text
                          fontWeight="bold"
                          fontSize="md"
                          isTruncated
                          textAlign="left"
                          color={pageFg}
                        >
                          {accountInfo.name}
                        </Text>
                        {networkSlice &&
                        networkSlice.lovelace !== null &&
                        networkSlice.lovelace !== undefined ? (
                          <UnitDisplay
                            quantity={(
                              bigIntLovelace(networkSlice.lovelace) -
                              bigIntLovelace(networkSlice.minAda) -
                              bigIntLovelace(networkSlice.collateral?.lovelace)
                            ).toString()}
                            decimals={6}
                            symbol={settings.adaSymbol}
                          />
                        ) : (
                          <Text
                            fontSize="sm"
                            color={mutedFg}
                            textAlign="left"
                          >
                            Select to load…
                          </Text>
                        )}
                      </Box>
                      {isCurrent ? (
                        <Flex
                          align="center"
                          gap={1.5}
                          flexShrink={0}
                          ml={2}
                          data-testid="accounts-selected-badge"
                        >
                          <CheckIcon color={currentAccent} boxSize={3} />
                          <Text
                            fontSize="xs"
                            fontWeight="bold"
                            color={currentAccent}
                            letterSpacing="0.02em"
                          >
                            Selected
                          </Text>
                        </Flex>
                      ) : null}
                      {isHW(accountInfo.index) ? (
                        <Text fontSize="xs" fontWeight="bold" ml={1}>
                          HW
                        </Text>
                      ) : null}
                    </Stack>
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Box
            className="lucem-inset-surface"
            rounded="3xl"
            p={{ base: 4, md: 5 }}
            data-testid="accounts-actions-panel"
          >
            <WalletSetupButtons spacing={3}>
              {canDelete ? (
                <Button
                  colorScheme="red"
                  variant="outline"
                  leftIcon={<DeleteIcon />}
                  rounded="xl"
                  h="12"
                  onClick={() => deleteAccountRef.current.openModal()}
                >
                  Delete Account
                </Button>
              ) : null}
              <Button
                leftIcon={<Icon as={FaRegFileCode} />}
                rounded="xl"
                h="12"
                variant="outline"
                isDisabled={!currentAccount}
                onClick={() => {
                  if (currentAccount) {
                    builderRef.current.initCollateral(currentAccount);
                  }
                }}
              >
                Collateral
              </Button>
            </WalletSetupButtons>
            <Button
              mt={3}
              w="full"
              rounded="xl"
              h="12"
              variant="ghost"
              onClick={() => aboutRef.current.openModal()}
            >
              About
            </Button>
          </Box>
        </Stack>
      </Box>

      <DeleteAccountModal
        name={currentAccount && currentAccount.name}
        ref={deleteAccountRef}
        onDeleted={load}
      />
      <TransactionBuilder ref={builderRef} />
      <About ref={aboutRef} />
    </Box>
  );
};

const DeleteAccountModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isLoading, setIsLoading] = React.useState(false);
  const cancelRef = React.useRef();
  const { pageFg } = useSurfaceColors();

  React.useImperativeHandle(ref, () => ({
    openModal() {
      onOpen();
    },
  }));

  return (
    <AlertDialog
      size="xs"
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent
          className="lucem-inset-surface"
          color={pageFg}
          mx={4}
          rounded="2xl"
        >
          <AlertDialogHeader fontSize="md" fontWeight="bold">
            Delete current account
          </AlertDialogHeader>

          <AlertDialogBody>
            <Text fontSize="sm">
              Are you sure you want to delete <b>{props.name}</b>?
            </Text>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose} mr={3}>
              Cancel
            </Button>
            <Button
              isDisabled={isLoading}
              isLoading={isLoading}
              colorScheme="red"
              onClick={async () => {
                setIsLoading(true);
                try {
                  await deleteAccount();
                  const remaining = await getAccounts();
                  const firstKey = Object.keys(remaining)[0];
                  if (firstKey !== undefined) {
                    await switchAccount(
                      isNaN(firstKey) ? firstKey : parseInt(firstKey)
                    );
                  }
                  props.onDeleted?.();
                } catch (e) {
                  console.error('Delete account error:', e);
                }
                onClose();
                setIsLoading(false);
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
});

export default Accounts;
