import {Text, Box, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import * as React from 'react';

import ChatUI from '../components/ChatUI.js';
import DashboardCLI from '../components/DashboardCLI.js';
import GeneratorUI from '../components/GeneratorUI.js';
import {StatusChecker} from '../components/statusChecker.js';
import {ConfigManager} from '../config.js';
import {ArkClient} from '../lib/arkClient.js';
import {StatusData, ServiceStatus} from '../lib/types.js';

const EXIT_TIMEOUT_MS = 1000;

type MenuChoice = 'dashboard' | 'status' | 'generate' | 'chat' | 'exit';

interface MenuItem {
  label: string;
  value: MenuChoice;
}

const MainMenu: React.FC = () => {
  const [selectedChoice, setSelectedChoice] = React.useState<MenuChoice | null>(
    null
  );
  const [statusData, setStatusData] = React.useState<StatusData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const choices: MenuItem[] = [
    {label: '💬 Chat', value: 'chat'},
    {label: '🏷️  Dashboard', value: 'dashboard'},
    {label: '🔍 Status Check', value: 'status'},
    {label: '🎯 Generate', value: 'generate'},
    {label: '👋 Exit', value: 'exit'},
  ];

  React.useEffect(() => {
    if (selectedChoice === 'exit') {
      const timer = setTimeout(() => {
        process.exit(0);
      }, EXIT_TIMEOUT_MS);

      return () => clearTimeout(timer);
    }
  }, [selectedChoice]);

  React.useEffect(() => {
    if (selectedChoice === 'status' && !statusData && !isLoading) {
      checkStatus();
    }
  }, [selectedChoice, statusData, isLoading]);

  const checkStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const configManager = new ConfigManager();
      const apiBaseUrl = await configManager.getApiBaseUrl();
      const serviceUrls = await configManager.getServiceUrls();
      const arkClient = new ArkClient(apiBaseUrl);
      const statusChecker = new StatusChecker(arkClient);

      const status = await statusChecker.checkAll(serviceUrls, apiBaseUrl);
      setStatusData(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useInput((input, key) => {
    if (selectedChoice && selectedChoice !== 'exit') {
      if (key.escape || input === 'q' || key.return) {
        // For generate and chat, only reset on specific key combinations to avoid conflicts
        if ((selectedChoice === 'generate' || selectedChoice === 'chat') && !(key.escape || input === 'q')) {
          return;
        }
        setSelectedChoice(null);
        setStatusData(null);
        setError(null);
      }
    }
  });

  const renderBanner = () => (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      <Text color="cyan" bold>
        {`
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║         █████╗ ██████╗ ██╗  ██╗       ║
    ║        ██╔══██╗██╔══██╗██║ ██╔╝       ║
    ║        ███████║██████╔╝█████╔╝        ║
    ║        ██╔══██║██╔══██╗██╔═██╗        ║
    ║        ██║  ██║██║  ██║██║  ██╗       ║
    ║        ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝       ║
    ║                                       ║
    ║        Agents at Scale Platform       ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
        `}
      </Text>
      <Text color="green" bold>
        Welcome to ARK! 🚀
      </Text>
      <Text color="gray">Interactive terminal interface for ARK agents</Text>
    </Box>
  );

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

  const renderStatus = () => {
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

  return (
    <>
      {renderBanner()}

      {!selectedChoice && (
        <SelectInput
          items={choices}
          onSelect={(choice) => {
            setSelectedChoice(choice.value);
          }}
        />
      )}

      {selectedChoice === 'status' && renderStatus()}
      {selectedChoice === 'dashboard' && (
        <Box flexDirection="column">
          <Text color="green">🏷️ Dashboard feature selected</Text>
          <DashboardCLI />
        </Box>
      )}
      {selectedChoice === 'generate' && <GeneratorUI />}
      {selectedChoice === 'chat' && <ChatUI />}
      {selectedChoice === 'exit' && <Text color="yellow">👋 Goodbye!</Text>}
    </>
  );
};
export default MainMenu;
