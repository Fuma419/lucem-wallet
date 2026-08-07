import React from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  Textarea,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { CheckIcon, DeleteIcon } from '@chakra-ui/icons';
import { FaRegFileCode } from 'react-icons/fa';
import { MdModeEdit, MdVpnKey } from 'react-icons/md';
import { useStoreState } from 'easy-peasy';
import {
  deleteAccount,
  getAccounts,
  getCurrentAccountIndex,
  getNativeAccounts,
  getSignableWalletIds,
  isAccountSignable,
  isHW,
  onAccountChange,
  setAccountName,
  switchAccount,
  validateAccountWithSeed,
} from '../../../api/extension';
import { bigIntLovelace } from '../../../api/lovelace-scalar';
import AvatarLoader from '../components/avatarLoader';
import UnitDisplay from '../components/unitDisplay';
import TransactionBuilder from '../components/transactionBuilder';
import { WalletSetupButtons } from '../components/walletSetupFlow';
import MultiAddressSettings from '../components/multiAddressSettings';
import useSurfaceColors from '../hooks/useSurfaceColors';
import { isSameAccountIndex } from '../utils/accountIndex';

/** Bottom clearance so list content sits above fixed trays. */
const TRAY_CLEARANCE_PB =
  'calc(6.5rem + env(safe-area-inset-bottom, 0px))';

/**
 * Temporary: hide the Accounts rename field so iOS Face ID / Password AutoFill
 * can be verified without that input present. Set back to `true` after the check.
 */
const ACCOUNT_RENAME_ENABLED = false;

const Accounts = () => {
  const settings = useStoreState((state) => state.settings.settings);
  const deleteAccountRef = React.useRef();
  const builderRef = React.useRef();
  const validateSeedRef = React.useRef();

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
  const [nameDraft, setNameDraft] = React.useState('');
  const [signableIds, setSignableIds] = React.useState([]);

  const load = React.useCallback(async () => {
    const index = await getCurrentAccountIndex();
    const all = await getAccounts();
    const ids = await getSignableWalletIds();
    setCurrentIndex(index);
    setAccountsMeta(all || {});
    setAccountsLive(all || {});
    setSignableIds(ids || []);
  }, []);

  React.useEffect(() => {
    load();
    const handler = onAccountChange(() => load());
    return () => handler && handler.remove();
  }, [load, settings.network?.id]);

  const currentAccount = accountsLive && currentIndex != null
    ? accountsLive[currentIndex]
    : null;

  const currentName = currentAccount?.name || '';

  // Keep the rename field in sync with whichever account is selected.
  React.useEffect(() => {
    setNameDraft(currentName);
  }, [currentName, currentIndex]);

  const canApplyName =
    nameDraft.trim().length > 0 && nameDraft.trim() !== currentName;

  const applyName = React.useCallback(async () => {
    const next = nameDraft.trim();
    if (!next || next === currentName) return;
    await setAccountName(next);
    await load();
  }, [nameDraft, currentName, load]);

  const currentSignable = isAccountSignable(currentAccount, signableIds);

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
                const rowSignable = isAccountSignable(accountInfo, signableIds);
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
                      {!rowSignable ? (
                        <Badge
                          ml={1}
                          flexShrink={0}
                          colorScheme="yellow"
                          variant="subtle"
                          fontSize="0.6rem"
                          textTransform="none"
                          data-testid={`accounts-needs-seed-${accountIndex}`}
                        >
                          Needs seed
                        </Badge>
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

          {currentAccount &&
          (ACCOUNT_RENAME_ENABLED || !currentSignable) ? (
            <Box
              className="lucem-inset-surface"
              rounded="3xl"
              p={{ base: 4, md: 5 }}
              data-testid="accounts-rename-panel"
            >
              {ACCOUNT_RENAME_ENABLED ? (
                <>
                  <Text fontSize="sm" color={mutedFg} mb={2}>
                    Rename selected account
                  </Text>
                  <InputGroup size="md" w="full">
                    <Input
                      variant="outline"
                      rounded="xl"
                      placeholder="Account name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canApplyName) applyName();
                      }}
                      pr="4.5rem"
                      data-testid="accounts-rename-input"
                    />
                    <InputRightElement width="4.5rem" h="full">
                      {canApplyName ? (
                        <Button
                          h="1.75rem"
                          size="sm"
                          rounded="md"
                          onClick={applyName}
                          data-testid="accounts-rename-apply"
                        >
                          Apply
                        </Button>
                      ) : (
                        <Icon mr="-2" as={MdModeEdit} color={mutedFg} />
                      )}
                    </InputRightElement>
                  </InputGroup>
                </>
              ) : null}

              {!currentSignable ? (
                <Button
                  mt={ACCOUNT_RENAME_ENABLED ? 3 : 0}
                  w="full"
                  rounded="xl"
                  h="12"
                  colorScheme="yellow"
                  leftIcon={<Icon as={MdVpnKey} />}
                  onClick={() =>
                    validateSeedRef.current?.openModal({
                      accountKey: currentIndex,
                      name: currentAccount?.name,
                    })
                  }
                  data-testid="accounts-validate-button"
                >
                  Import seed to enable signing
                </Button>
              ) : null}
            </Box>
          ) : null}

          {currentAccount ? (
            <Box
              className="lucem-inset-surface"
              rounded="3xl"
              p={{ base: 4, md: 5 }}
              data-testid="accounts-multi-address-panel"
            >
              <Text fontSize="sm" fontWeight="bold" color={pageFg} mb={1}>
                Addresses
              </Text>
              <Text fontSize="sm" color={mutedFg} mb={3}>
                Receive and change addresses for the selected account.
              </Text>
              <MultiAddressSettings
                account={currentAccount}
                onIndicesChange={async () => {
                  await load();
                }}
              />
            </Box>
          ) : null}

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
          </Box>
        </Stack>
      </Box>

      <DeleteAccountModal
        name={currentAccount && currentAccount.name}
        ref={deleteAccountRef}
        onDeleted={load}
      />
      <ValidateSeedModal ref={validateSeedRef} onValidated={load} />
      <TransactionBuilder ref={builderRef} />
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

const ValidateSeedModal = React.forwardRef((props, ref) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [target, setTarget] = React.useState(null);
  const [seed, setSeed] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const { pageFg } = useSurfaceColors();
  const toast = useToast();

  React.useImperativeHandle(ref, () => ({
    openModal(next) {
      setTarget(next || null);
      setSeed('');
      setPassword('');
      setError(null);
      onOpen();
    },
  }));

  const normalizedSeed = seed.trim().replace(/\s+/g, ' ');
  const wordCount = normalizedSeed ? normalizedSeed.split(' ').length : 0;
  const canSubmit =
    [12, 15, 24].includes(wordCount) && password.length >= 8 && !isLoading;

  const submit = async () => {
    if (!target || !canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      const { validated } = await validateAccountWithSeed(
        target.accountKey,
        normalizedSeed,
        password
      );
      toast({
        title: 'Account validated',
        description: `${validated} account(s) can now sign transactions.`,
        status: 'success',
        duration: 5000,
      });
      setSeed('');
      setPassword('');
      onClose();
      props.onValidated?.();
    } catch (e) {
      setError(e?.message || 'Validation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal size="xs" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent
        className="lucem-inset-surface"
        color={pageFg}
        mx={4}
        rounded="2xl"
      >
        <ModalHeader fontSize="md" fontWeight="bold">
          Import seed for {target?.name || 'account'}
        </ModalHeader>
        <ModalBody>
          <Text fontSize="sm" mb={3}>
            Enter the recovery phrase for this account. It is verified against the
            account&apos;s public key and never leaves this device.
          </Text>
          <Textarea
            placeholder="Recovery phrase (12, 15 or 24 words)"
            value={seed}
            onChange={(e) => {
              setSeed(e.target.value);
              setError(null);
            }}
            rows={3}
            rounded="xl"
            data-testid="validate-seed-input"
          />
          <Input
            mt={3}
            type="password"
            placeholder="Wallet password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            rounded="xl"
            data-testid="validate-seed-password"
          />
          {error ? (
            <Text mt={2} fontSize="sm" color="red.300">
              {error}
            </Text>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme="yellow"
            isDisabled={!canSubmit}
            isLoading={isLoading}
            onClick={submit}
            data-testid="validate-seed-submit"
          >
            Validate
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

export default Accounts;
