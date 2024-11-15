import React from 'react';
import { Button, Flex, useColorModeValue } from '@chakra-ui/react';
import { Text } from './text.component';
import { dismissMigration } from '../../../api/migration-tool/cross-extension-messaging/nami-migration-client.extension';
import { ReactComponent as PendingDark } from '../assets/clock.svg';

export const DismissBtn = ({
  dismissableIntervalSeconds,
  hasIcon,
  onDismiss,
}) => {
  const futureDate = new Date();
  const futureTime = futureDate.setTime(
    futureDate.getTime() + dismissableIntervalSeconds * 1000
  );
  const textColor = useColorModeValue('#6F7786', '#FFFFFF');
  const Icon = !!hasIcon && <PendingDark color={textColor} style={{ height: 24, width: 24 }} />;

  return (
    <Button
      height="auto"
      borderRadius="16px"
      py="10px"
      flex={1}
      width={'100%'}
      border="2px solid transparent"
      backgroundColor="none"
      onClick={async () => {
        onDismiss();
        await dismissMigration({ dismissMigrationUntil: futureTime });
      }}
    >
      <Flex alignItems="center">
        {Icon}
        <Text color={textColor} ml="6px" fontWeight="700" lineHeight="normal">
          Remind me later
        </Text>
      </Flex>
    </Button>
  );
};
