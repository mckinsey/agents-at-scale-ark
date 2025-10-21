import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import * as React from 'react';

export type StatusType = 'loading' | 'success' | 'error' | 'info';

interface StatusMessageProps {
  /** Status type determines icon and color */
  status: StatusType;
  /** Main message text (bold) */
  message: string;
  /** Optional hint shown in gray next to message */
  hint?: string;
  /** Optional details shown indented with ⎿ prefix */
  details?: string;
  /** Optional full error message shown below details */
  errorMessage?: string;
  /** Optional tip shown indented with ⎿ prefix */
  tip?: string;
  /** Optional content rendered below message */
  children?: React.ReactNode;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  status,
  message,
  hint,
  details,
  errorMessage,
  tip,
  children,
}) => {
  const statusConfig = {
    loading: {icon: <Spinner type="dots" />, color: 'yellow'},
    success: {icon: '✓', color: 'green'},
    error: {icon: '✗', color: 'red'},
    info: {icon: '●', color: 'cyan'},
  } as const;

  const config = statusConfig[status];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={config.color}>
          {typeof config.icon === 'string' ? config.icon : config.icon}
        </Text>
        <Text> </Text>
        <Text color={config.color} bold>
          {message}
        </Text>
        {hint && <Text color="gray"> {hint}</Text>}
      </Box>

      {details && (
        <Box marginLeft={2}>
          <Text color="gray">⎿ {details}</Text>
        </Box>
      )}

      {errorMessage && (
        <Box marginLeft={2}>
          <Text color="gray">{errorMessage}</Text>
        </Box>
      )}

      {tip && (
        <Box marginLeft={2}>
          <Text color="gray">⎿ {tip}</Text>
        </Box>
      )}

      {children && <Box marginLeft={2}>{children}</Box>}
    </Box>
  );
};
