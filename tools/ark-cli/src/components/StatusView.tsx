import { Box, Text, useInput } from 'ink';
import * as React from 'react';
import { StatusData, ServiceStatus } from '../lib/types.js';

interface StatusViewProps {
  statusData: StatusData | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}

const StatusView: React.FC<StatusViewProps> = ({ statusData, isLoading, error, onBack }) => {
  useInput((input, key) => {
    if (key.escape || input === 'q' || key.return) {
      onBack();
    }
  });

  const renderServiceStatus = (service: ServiceStatus) => {
    const statusColor =
      service.status === 'healthy'
        ? 'green'
        : service.status === 'unhealthy'
          ? 'red'
          : 'yellow';

    const statusIcon =
      service.status === 'healthy'
        ? '✓'
        : service.status === 'unhealthy'
          ? '✗'
          : '?';

    return (
      <Box key={service.name} flexDirection="column" marginLeft={2}>
        <Box>
          <Text color={statusColor}>{statusIcon} </Text>
          <Text bold>{service.name}: </Text>
          <Text color={statusColor}>{service.status}</Text>
        </Box>
        {service.url && (
          <Box marginLeft={2}>
            <Text color="gray">URL: {service.url}</Text>
          </Box>
        )}
        {service.details && (
          <Box marginLeft={2}>
            <Text color="gray">{service.details}</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderDependencyStatus = (dep: any) => {
    const statusColor = dep.installed ? 'green' : 'red';
    const statusIcon = dep.installed ? '✓' : '✗';
    const statusText = dep.installed ? 'installed' : 'missing';

    return (
      <Box key={dep.name} flexDirection="column" marginLeft={2}>
        <Box>
          <Text color={statusColor}>{statusIcon} </Text>
          <Text bold>{dep.name}: </Text>
          <Text color={statusColor}>{statusText}</Text>
        </Box>
        {dep.version && (
          <Box marginLeft={2}>
            <Text color="gray">Version: {dep.version}</Text>
          </Box>
        )}
        {dep.details && (
          <Box marginLeft={2}>
            <Text color="gray">{dep.details}</Text>
          </Box>
        )}
      </Box>
    );
  };

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">🔍 Checking ARK system status...</Text>
        <Text color="gray">
          Please wait while we verify services and dependencies.
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Error checking status:</Text>
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text color="gray">
            Press ESC, 'q', or Enter to return to menu...
          </Text>
        </Box>
      </Box>
    );
  }

  if (!statusData) {
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>
        🔍 ARK System Status
      </Text>

      <Box marginTop={1}>
        <Text color="cyan" bold>
          📡 ARK Services:
        </Text>
      </Box>
      {statusData.services.map(renderServiceStatus)}

      <Box marginTop={1}>
        <Text color="cyan" bold>
          🛠️ System Dependencies:
        </Text>
      </Box>
      {statusData.dependencies.map(renderDependencyStatus)}

      <Box marginTop={1}>
        <Text color="gray">
          Press ESC, 'q', or Enter to return to menu...
        </Text>
      </Box>
    </Box>
  );
};

export default StatusView;