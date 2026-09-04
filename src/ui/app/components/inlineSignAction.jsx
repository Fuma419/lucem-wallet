import React from 'react';
import {
  Button,
  Input,
  InputGroup,
  InputRightElement,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ERROR } from '../../../config/config';
import useSurfaceColors from '../hooks/useSurfaceColors';

/**
 * Password entry and the confirm button, in the footer of a dApp approval
 * screen. Approving a request is then a single screen rather than a review
 * screen plus a password dialog stacked on top of it.
 *
 * Hardware accounts keep their own dialog: those flows are genuinely
 * multi-step (device prompts, QR exchange) and have no password to collect.
 */
const InlineSignAction = ({
  testId,
  label,
  cancelLabel = 'Cancel',
  isHw,
  isDisabled,
  sign,
  onSigned,
  onFailed,
  onHwRequest,
  onCancel,
}) => {
  const { pageFg, mutedFg, inputBg, inputBorder, placeholder } =
    useSurfaceColors();
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [wrongPassword, setWrongPassword] = React.useState(false);

  const canSubmit = !isDisabled && !busy && (isHw || password.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    if (isHw) {
      onHwRequest();
      return;
    }
    setBusy(true);
    setWrongPassword(false);
    try {
      const result = await sign(password);
      setPassword('');
      await onSigned(result);
    } catch (e) {
      if (e === ERROR.wrongPassword) setWrongPassword(true);
      else await onFailed(e);
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3} w="full" align="center">
      {!isHw && !isDisabled ? (
        <Stack spacing={1.5} w="full">
          <InputGroup size="md">
            <Input
              data-testid={`${testId}-password`}
              aria-label="Password"
              placeholder="Password"
              _placeholder={{ color: placeholder }}
              type={show ? 'text' : 'password'}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="current-password"
              height="48px"
              rounded="2xl"
              bg={inputBg}
              borderColor={inputBorder}
              focusBorderColor="yellow.600"
              isInvalid={wrongPassword}
              value={password}
              pr="4.5rem"
              onChange={(e) => {
                setWrongPassword(false);
                setPassword(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <InputRightElement width="4.5rem" height="48px">
              <Button
                size="sm"
                variant="ghost"
                rounded="lg"
                color={mutedFg}
                onClick={() => setShow((s) => !s)}
              >
                {show ? 'Hide' : 'Show'}
              </Button>
            </InputRightElement>
          </InputGroup>
          {wrongPassword ? (
            <Text
              data-testid={`${testId}-wrong-password`}
              fontSize="xs"
              color="red.300"
              px={1}
            >
              Wrong password.
            </Text>
          ) : null}
        </Stack>
      ) : null}
      <Button
        data-testid={`${testId}-primary-action`}
        width="full"
        height="52px"
        rounded="2xl"
        colorScheme="yellow"
        bg="yellow.400"
        color="gray.900"
        fontWeight="black"
        isDisabled={!canSubmit}
        isLoading={busy}
        _hover={{ bg: 'yellow.300', transform: 'translateY(-1px)' }}
        _active={{ bg: 'yellow.500' }}
        _disabled={{
          bg: 'whiteAlpha.200',
          color: 'whiteAlpha.500',
          cursor: 'not-allowed',
          transform: 'none',
          opacity: 1,
        }}
        onClick={submit}
      >
        {isHw ? `${label} with device` : label}
      </Button>
      <Button
        data-testid={`${testId}-cancel`}
        variant="ghost"
        width="full"
        height="44px"
        rounded="2xl"
        color={pageFg}
        isDisabled={busy}
        _hover={{ bg: 'whiteAlpha.100' }}
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </Stack>
  );
};

export default InlineSignAction;
