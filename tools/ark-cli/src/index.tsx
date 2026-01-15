#!/usr/bin/env node

import {Command} from 'commander';
import {render} from 'ink';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

import output from './lib/output.js';
import {startup} from './lib/startup.js';
import type {ArkConfig} from './lib/config.js';
import {createAgentsCommand} from './commands/agents/index.js';
import {createChatCommand} from './commands/chat/index.js';
import {createClusterCommand} from './commands/cluster/index.js';
import {createCompletionCommand} from './commands/completion/index.js';
import {createDashboardCommand} from './commands/dashboard/index.js';
import {createDocsCommand} from './commands/docs/index.js';
import {createEvaluationCommand} from './commands/evaluation/index.js';
import {createExportCommand} from './commands/export/index.js';
import {createGenerateCommand} from './commands/generate/index.js';
import {createImportCommand} from './commands/import/index.js';
import {createInstallCommand} from './commands/install/index.js';
import {createMarketplaceCommand} from './commands/marketplace/index.js';
import {createMemoryCommand} from './commands/memory/index.js';
import {createModelsCommand} from './commands/models/index.js';
import {createQueryCommand} from './commands/query/index.js';
import {createQueriesCommand} from './commands/queries/index.js';
import {createUninstallCommand} from './commands/uninstall/index.js';
import {createStatusCommand} from './commands/status/index.js';
import {createConfigCommand} from './commands/config/index.js';
import {createTargetsCommand} from './commands/targets/index.js';
import {createTeamsCommand} from './commands/teams/index.js';
import {createToolsCommand} from './commands/tools/index.js';
import {createRoutesCommand} from './commands/routes/index.js';
import MainMenu from './ui/MainMenu.js';

function showMainMenu(config: ArkConfig) {
  const app = render(<MainMenu config={config} />);
  // Store app instance globally so MainMenu can access it
  interface GlobalWithInkApp {
    inkApp?: ReturnType<typeof render>;
  }
  (globalThis as GlobalWithInkApp).inkApp = app;
}

async function main() {
  // Initialize CLI - check requirements and load config
  const config = await startup();

  const program = new Command();
  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version);

  program.addCommand(createAgentsCommand(config));
  program.addCommand(createChatCommand(config));
  program.addCommand(createClusterCommand(config));
  program.addCommand(createCompletionCommand(config));
  program.addCommand(createDashboardCommand(config));
  program.addCommand(createDocsCommand(config));
  program.addCommand(createEvaluationCommand(config));
  program.addCommand(createExportCommand(config));
  program.addCommand(createGenerateCommand(config));
  program.addCommand(createImportCommand(config));
  program.addCommand(createInstallCommand(config));
  program.addCommand(createMarketplaceCommand(config));
  program.addCommand(createMemoryCommand(config));
  program.addCommand(createModelsCommand(config));
  program.addCommand(createQueryCommand(config));
  program.addCommand(createQueriesCommand(config));
  program.addCommand(createUninstallCommand(config));
  program.addCommand(createStatusCommand());
  program.addCommand(createConfigCommand(config));
  program.addCommand(createTargetsCommand(config));
  program.addCommand(createTeamsCommand(config));
  program.addCommand(createToolsCommand(config));
  program.addCommand(createRoutesCommand(config));

  // If no args provided, show interactive menu
  if (process.argv.length === 2) {
    showMainMenu(config);
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  output.error('failed to start ark cli: ', error);
  process.exit(1);
});
