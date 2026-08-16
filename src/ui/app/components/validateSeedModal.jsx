import React from 'react';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { validateAccountWithSeed } from '../../../api/extension';
import useSurfaceColors from '../hooks/useSurfaceColors';

/**
 * Re-attach a recovery phrase to a sterilized (needs-seed) software account.
 * Used from Accounts and from Send so a user who hits the signability wall
 * while composing a tx can unlock the account without leaving the flow.
 */
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
          Restore seed for {target?.name || 'account'}
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

export default ValidateSeedModal;
