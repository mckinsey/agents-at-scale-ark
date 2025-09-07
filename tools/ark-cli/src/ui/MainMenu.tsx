import {Text, Box, render} from 'ink';
import SelectInput from 'ink-select-input';
import * as React from 'react';

type MenuChoice = 'dashboard' | 'status' | 'generate' | 'chat' | 'exit';

interface MenuItem {
  label: string;
  value: MenuChoice;
  command?: string;
}

const MainMenu: React.FC = () => {
  const choices: MenuItem[] = [
    {label: '💬 Chat', value: 'chat', command: 'ark chat'},
    {label: '🏷️  Dashboard', value: 'dashboard', command: 'ark dashboard'},
    {label: '🔍 Status Check', value: 'status', command: 'ark status'},
    {label: '🎯 Generate', value: 'generate', command: 'ark generate'},
    {label: '👋 Exit', value: 'exit'},
  ];

  const handleSelect = async (item: MenuItem) => {
    switch (item.value) {
      case 'exit':
        process.exit(0);
        break;
        
      case 'chat': {
        const ChatUI = (await import('../components/ChatUI.js')).default;
        render(<ChatUI />);
        break;
      }
        
      case 'dashboard': {
        // Import and run the dashboard command
        const { createDashboardCommand } = await import('../commands/dashboard.js');
        const dashboardCmd = createDashboardCommand();
        await dashboardCmd.parseAsync(['node', 'ark', 'dashboard']);
        break;
      }
        
      case 'status': {
        const StatusView = (await import('../components/StatusView.js')).default;
        const { StatusChecker } = await import('../components/statusChecker.js');
        const { ConfigManager } = await import('../config.js');
        const { ArkClient } = await import('../lib/arkClient.js');
        
        const configManager = new ConfigManager();
        const apiBaseUrl = await configManager.getApiBaseUrl();
        const serviceUrls = await configManager.getServiceUrls();
        const arkClient = new ArkClient(apiBaseUrl);
        const statusChecker = new StatusChecker(arkClient);
        
        let statusData = null;
        let error = null;
        
        try {
          statusData = await statusChecker.checkAll(serviceUrls, apiBaseUrl);
        } catch (err) {
          error = err instanceof Error ? err.message : 'Unknown error';
        }
        
        render(
          <StatusView
            statusData={statusData}
            isLoading={false}
            error={error}
            onBack={() => process.exit(0)}
          />
        );
        break;
      }
        
      case 'generate': {
        const GeneratorUI = (await import('../components/GeneratorUI.js')).default;
        render(<GeneratorUI />);
        break;
      }
    }
  };

  return (
    <>
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
      
      <SelectInput items={choices} onSelect={handleSelect} />
    </>
  );
};

export default MainMenu;