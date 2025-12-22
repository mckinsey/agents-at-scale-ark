import {Text, Box, render, useInput} from 'ink';
import Spinner from 'ink-spinner';
import * as React from 'react';
import {isArkReady} from '../lib/arkStatus.js';
import type {ArkConfig} from '../lib/config.js';
import {fetchVersionInfo} from '../lib/versions.js';
import type {ArkVersionInfo} from '../lib/versions.js';

type MenuChoice =
  | 'dashboard'
  | 'status'
  | 'generate'
  | 'chat'
  | 'install'
  | 'upgrade'
  | 'exit';

interface MenuItem {
  label: string;
  description: string;
  value: MenuChoice;
  command?: string;
}

//  Helper function to unmount the main ink app - used when we move from a
//  React TUI app to basic input/output.
async function unmountInkApp() {
  interface GlobalWithInkApp {
    inkApp?: {
      unmount: () => void;
    };
  }
  const app = (globalThis as GlobalWithInkApp).inkApp;
  if (app) {
    // Unmount the Ink app
    app.unmount();

    // Clear the global reference
    delete (globalThis as GlobalWithInkApp).inkApp;

    // Reset terminal to normal mode
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    // Clear screen
    console.clear();

    // Small delay to ensure everything is flushed
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

interface MainMenuProps {
  config: ArkConfig;
}

const MainMenu: React.FC<MainMenuProps> = ({config}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [arkReady, setArkReady] = React.useState<boolean | null>(null);
  const [isChecking, setIsChecking] = React.useState(true);
  const [versionInfo, setVersionInfo] = React.useState<ArkVersionInfo>({});

  React.useEffect(() => {
    const checkStatus = async () => {
      setIsChecking(true);

      // Run ark ready check and version fetch in parallel
      const [ready, versions] = await Promise.all([
        isArkReady(),
        fetchVersionInfo(),
      ]);

      setArkReady(ready);
      setVersionInfo(versions);
      setIsChecking(false);
      // Reset selected index to 0 after status check
      setSelectedIndex(0);
    };
    checkStatus();
  }, []);

  // Handle Ctrl+C to properly unmount Ink and restore terminal
  React.useEffect(() => {
    const handleExit = () => {
      const app = (globalThis as any).inkApp;
      if (app) {
        app.unmount();
      }
      process.exit(0);
    };

    process.on('SIGINT', handleExit);

    return () => {
      process.removeListener('SIGINT', handleExit);
    };
  }, []);

  // Check if upgrade is available
  const hasUpgrade = React.useMemo(() => {
    return versionInfo.updateAvailable === true;
  }, [versionInfo.updateAvailable]);

  const allChoices: MenuItem[] = [
    {
      label: 'Chat',
      description: 'Interactive chat with Ark agents',
      value: 'chat',
      command: 'ark chat',
    },
    {
      label: 'Install',
      description: 'Install Ark',
      value: 'install',
      command: 'ark install',
    },
    {
      label: 'Upgrade',
      description: `Upgrade Ark from ${versionInfo.current || 'unknown'} to ${versionInfo.latest || 'unknown'}`,
      value: 'upgrade',
      command: 'ark install -y',
    },
    {
      label: 'Dashboard',
      description: 'Open Ark dashboard in browser',
      value: 'dashboard',
      command: 'ark dashboard',
    },
    {
      label: 'Status',
      description: 'Check Ark services status',
      value: 'status',
      command: 'ark status',
    },
    {
      label: 'Generate',
      description: 'Generate new Ark components',
      value: 'generate',
      command: 'ark generate',
    },
    {label: 'Exit', description: 'Exit Ark CLI', value: 'exit'},
  ];

  // Filter choices based on Ark readiness
  const choices = React.useMemo(() => {
    // Don't return any choices while checking
    if (isChecking) return [];

    if (!arkReady) {
      // Only show Install, Status, and Exit when Ark is not ready
      return allChoices.filter((choice) =>
        ['install', 'status', 'exit'].includes(choice.value)
      );
    }

    // Ark is ready - filter out install (already installed) and conditionally show upgrade
    const filteredChoices = allChoices.filter((choice) => {
      // Never show install when Ark is ready (it's already installed)
      if (choice.value === 'install') return false;
      // Only show upgrade if there's actually an upgrade available
      if (choice.value === 'upgrade' && !hasUpgrade) return false;
      return true;
    });

    return filteredChoices;
  }, [arkReady, isChecking, hasUpgrade, allChoices]);

  useInput((input: string, key: any) => {
    // Don't process input while checking status
    if (isChecking) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : choices.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < choices.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      handleSelect(choices[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        handleSelect(choices[num - 1]);
      }
    }
  });

  const handleSelect = async (item: MenuItem) => {
    switch (item.value) {
      case 'exit':
        process.exit(0);
        break;

      case 'chat': {
        // Unmount fullscreen app and clear screen.
        await unmountInkApp();

        // Import and start ChatUI in the same process
        const {render} = await import('ink');
        const {ArkApiProxy} = await import('../lib/arkApiProxy.js');
        const {loadConfig} = await import('../lib/config.js');
        const ChatUI = (await import('../components/ChatUI.js')).default;

        try {
          const config = loadConfig();
          const proxy = new ArkApiProxy(
            undefined,
            config.services?.reusePortForwards ?? false
          );
          const arkApiClient = await proxy.start();

          // Render ChatUI as a new Ink app
          render(<ChatUI arkApiClient={arkApiClient} arkApiProxy={proxy} />);
        } catch (error) {
          const output = (await import('../lib/output.js')).default;
          output.error(
            error instanceof Error
              ? error.message
              : 'Failed to connect to Ark API'
          );
          process.exit(1);
        }
        break;
      }

      case 'install': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        // Spawn as a new process to avoid Ink/inquirer signal conflicts
        const {execFileSync} = await import('child_process');
        try {
          execFileSync(process.execPath, [process.argv[1], 'install'], {
            stdio: 'inherit',
            env: {...process.env, FORCE_COLOR: '1'},
          });
        } catch (error: any) {
          // execFileSync throws if the process exits with non-zero
          process.exit(error.status || 1);
        }
        process.exit(0);
        break; // Add break even though process.exit prevents reaching here
      }

      case 'upgrade': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        // Spawn as a new process with -y flag for automatic upgrade
        const {execFileSync} = await import('child_process');
        try {
          execFileSync(process.execPath, [process.argv[1], 'install', '-y'], {
            stdio: 'inherit',
            env: {...process.env, FORCE_COLOR: '1'},
          });
        } catch (error: any) {
          // execFileSync throws if the process exits with non-zero
          process.exit(error.status || 1);
        }
        process.exit(0);
        break; // Add break even though process.exit prevents reaching here
      }

      case 'dashboard': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {openDashboard} = await import('../commands/dashboard/index.js');
        const {loadConfig} = await import('../lib/config.js');
        const config = loadConfig();
        await openDashboard(config);
        break;
      }

      case 'status': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {checkStatus} = await import('../commands/status/index.js');
        await checkStatus();
        process.exit(0);
        break; // Add break even though process.exit prevents reaching here
      }

      case 'generate': {
        const GeneratorUI = (await import('../components/GeneratorUI.js'))
          .default;
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
        {/* Status replaces welcome message */}
        {isChecking ? (
          <Text color="gray">
            <Spinner type="dots" /> Checking Ark status...
          </Text>
        ) : arkReady ? (
          <Box>
            <Text color="green" bold>
              ● Ark is ready
            </Text>
            <Text color="gray">
              {' '}
              ({versionInfo.current || 'version unknown'})
            </Text>
          </Box>
        ) : (
          <Text color="yellow" bold>
            ● Ark is not installed
          </Text>
        )}
        {config.clusterInfo?.context ? (
          <Text>
            <Text color="gray">Current context: </Text>
            <Text color="white" bold>
              {config.clusterInfo.context}
            </Text>
          </Text>
        ) : (
          <Text color="gray">No Kubernetes context configured</Text>
        )}
      </Box>

      {/* Show menu only when not checking */}
      {!isChecking && (
        <Box flexDirection="column" paddingX={4} marginTop={1}>
          {choices.map((choice, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={choice.value} flexDirection="row" paddingY={0}>
                <Text color="gray" dimColor>
                  {isSelected ? '❯ ' : '  '}
                </Text>
                <Text color="gray" dimColor>
                  {index + 1}.
                </Text>
                <Box marginLeft={1} width={20}>
                  <Text
                    color={isSelected ? 'green' : 'white'}
                    bold={isSelected}
                  >
                    {choice.label}
                  </Text>
                </Box>
                <Text color="gray">{choice.description}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
};

export default MainMenu;
