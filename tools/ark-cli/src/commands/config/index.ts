import {Command} from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  getConfigPaths,
  formatConfig,
  type ArkConfig,
} from '../../lib/config.js';
import fs from 'fs';

export function createConfigCommand(_: ArkConfig): Command {
  const configCommand = new Command('config');
  configCommand.description('Show current configuration').action(() => {
    const config = loadConfig();
    const paths = getConfigPaths();

    console.log();

    // User config
    if (fs.existsSync(paths.user)) {
      console.log(chalk.green('✓'), chalk.white(paths.user));
    } else {
      console.log(
        chalk.red('✗'),
        chalk.white(paths.user),
        chalk.gray(`doesn't exist`)
      );
    }

    // Project config
    if (fs.existsSync(paths.project)) {
      console.log(chalk.green('✓'), chalk.white(paths.project));
    } else {
      console.log(
        chalk.red('✗'),
        chalk.white(paths.project),
        chalk.gray(`doesn't exist`)
      );
    }

    // Environment variables
    if (process.env.ARK_CHAT_STREAMING !== undefined) {
      console.log(
        chalk.green('✓'),
        chalk.white('ARK_CHAT_STREAMING'),
        chalk.gray(process.env.ARK_CHAT_STREAMING)
      );
    } else {
      console.log(
        chalk.red('✗'),
        chalk.white('ARK_CHAT_STREAMING'),
        chalk.gray('not set')
      );
    }

    if (process.env.ARK_CHAT_OUTPUT_FORMAT !== undefined) {
      console.log(
        chalk.green('✓'),
        chalk.white('ARK_CHAT_OUTPUT_FORMAT'),
        chalk.gray(process.env.ARK_CHAT_OUTPUT_FORMAT)
      );
    } else {
      console.log(
        chalk.red('✗'),
        chalk.white('ARK_CHAT_OUTPUT_FORMAT'),
        chalk.gray('not set')
      );
    }

    console.log();
    console.log(formatConfig(config));
  });

  return configCommand;
}
