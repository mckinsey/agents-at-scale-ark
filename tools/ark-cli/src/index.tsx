#!/usr/bin/env NODE_NO_WARNINGS=1 node

import chalk from 'chalk';
import { Command } from 'commander';
import { render } from 'ink';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

import { createChatCommand } from './commands/chat.js';
import { createClusterCommand } from './commands/cluster/index.js';
import { createCompletionCommand } from './commands/completion.js';
import { createDashboardCommand } from './commands/dashboard.js';
import { createGenerateCommand } from './commands/generate/index.js';
import { createStatusCommand } from './commands/status.js';
import { createConfigCommand } from './commands/config.js';
import { createTargetsCommand } from './commands/targets.js';
import { StatusChecker } from './components/statusChecker.js';
import { ConfigManager } from './config.js';
import { ArkClient } from './lib/arkClient.js';
import MainMenu from './ui/MainMenu.js';
import { StatusFormatter } from './ui/statusFormatter.js';

function showMainMenu() {
  const app = render(<MainMenu />);
  // Store app instance globally so MainMenu can access it
  (global as any).inkApp = app;
}

async function handleStatusCheck() {
  try {
    const configManager = new ConfigManager();
    const apiBaseUrl = await configManager.getApiBaseUrl();
    const serviceUrls = await configManager.getServiceUrls();
    const arkClient = new ArkClient(apiBaseUrl);

    const statusChecker = new StatusChecker(arkClient);

    const statusData = await statusChecker.checkAll(serviceUrls, apiBaseUrl);
    StatusFormatter.printStatus(statusData);
    process.exit(0); // Exit cleanly after showing status
  } catch (error) {
    console.error(chalk.red('Failed to check status:'), error);
    process.exit(1);
  }
}

async function main() {
  const program = new Command();
  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version);

  program.addCommand(createChatCommand());
  program.addCommand(createClusterCommand());
  program.addCommand(createCompletionCommand());
  program.addCommand(createDashboardCommand());
  program.addCommand(createGenerateCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createTargetsCommand());

  // Add check status command
  const checkCommand = new Command('check');
  checkCommand.description('Check various ARK system components');

  checkCommand
    .command('status')
    .description('Check system status')
    .action(handleStatusCheck);

  program.addCommand(checkCommand);

  // If no args provided, show interactive menu
  if (process.argv.length === 2) {
    showMainMenu();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(chalk.red('Failed to start ARK CLI:'), error);
  process.exit(1);
});
