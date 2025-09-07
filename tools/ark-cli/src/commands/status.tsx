import { Command } from 'commander';
import { render } from 'ink';
import * as React from 'react';
import { StatusChecker } from '../components/statusChecker.js';
import StatusView from '../components/StatusView.js';
import { ConfigManager } from '../config.js';
import { ArkClient } from '../lib/arkClient.js';
import { StatusData } from '../lib/types.js';

export function createStatusCommand(): Command {
  const statusCommand = new Command('status');
  statusCommand
    .description('Check ARK system status')
    .action(async () => {
      const configManager = new ConfigManager();
      const apiBaseUrl = await configManager.getApiBaseUrl();
      const serviceUrls = await configManager.getServiceUrls();
      const arkClient = new ArkClient(apiBaseUrl);
      const statusChecker = new StatusChecker(arkClient);

      // Render the status view component
      const { waitUntilExit } = render(
        <StatusComponent 
          statusChecker={statusChecker}
          serviceUrls={serviceUrls}
          apiBaseUrl={apiBaseUrl}
        />
      );

      await waitUntilExit();
    });

  return statusCommand;
}

// Wrapper component to handle async status checking
const StatusComponent: React.FC<{
  statusChecker: StatusChecker;
  serviceUrls: any;
  apiBaseUrl: string;
}> = ({ statusChecker, serviceUrls, apiBaseUrl }) => {
  const [statusData, setStatusData] = React.useState<StatusData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    statusChecker.checkAll(serviceUrls, apiBaseUrl)
      .then(setStatusData)
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <StatusView
      statusData={statusData}
      isLoading={isLoading}
      error={error}
      onBack={() => process.exit(0)}
    />
  );
};