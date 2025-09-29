import {Command} from 'commander';
import chalk from 'chalk';
import {execute} from '../../lib/commands.js';
import inquirer from 'inquirer';
import type {ArkConfig} from '../../lib/config.js';
import {showNoClusterError} from '../../lib/startup.js';
import output from '../../lib/output.js';
import {getInstallableServices, type ArkService} from '../../arkServices.js';

async function uninstallService(service: ArkService, verbose: boolean = false) {
  const helmArgs = ['uninstall', service.helmReleaseName, '--ignore-not-found'];

  // Only add namespace flag if service has explicit namespace
  if (service.namespace) {
    helmArgs.push('--namespace', service.namespace);
  }

  await execute('helm', helmArgs, {stdio: 'inherit'}, {verbose});
}

async function uninstallArk(
  config: ArkConfig,
  serviceName?: string,
  options: {yes?: boolean; verbose?: boolean} = {}
) {
  // Check cluster connectivity from config
  if (!config.clusterInfo) {
    showNoClusterError();
    process.exit(1);
  }

  const clusterInfo = config.clusterInfo;

  // Show cluster info
  output.success(`connected to cluster: ${chalk.bold(clusterInfo.context)}`);
  console.log(); // Add blank line after cluster info

  // If a specific service is requested, uninstall only that service
  if (serviceName) {
    const services = getInstallableServices();
    const service = Object.values(services).find((s) => s.name === serviceName);

    if (!service) {
      output.error(`service '${serviceName}' not found`);
      output.info('available services:');
      for (const s of Object.values(services)) {
        output.info(`  ${s.name}`);
      }
      process.exit(1);
    }

    output.info(`uninstalling ${service.name}...`);
    try {
      await uninstallService(service, options.verbose);
      output.success(`${service.name} uninstalled successfully`);
    } catch (error) {
      output.error(`failed to uninstall ${service.name}`);
      console.error(error);
      process.exit(1);
    }
    return;
  }

  // Get installable services and iterate through them in reverse order for clean uninstall
  const services = getInstallableServices();
  const serviceEntries = Object.entries(services).reverse();

  for (const [, service] of serviceEntries) {
    let shouldUninstall = false;

    try {
      // Ask for confirmation
      shouldUninstall =
        options.yes ||
        (
          await inquirer.prompt([
            {
              type: 'confirm',
              name: 'shouldUninstall',
              message: `uninstall ${chalk.bold(service.name)}? ${service.description ? chalk.gray(`(${service.description.toLowerCase()})`) : ''}`,
              default: true,
            },
          ])
        ).shouldUninstall;
    } catch (error) {
      // Handle Ctrl-C gracefully
      if (error && (error as {name?: string}).name === 'ExitPromptError') {
        console.log('\nUninstallation cancelled');
        process.exit(130); // Standard exit code for SIGINT
      }
      throw error;
    }

    if (!shouldUninstall) {
      output.warning(`skipping ${service.name}`);
      continue;
    }

    try {
      await uninstallService(service, options.verbose);
      console.log(); // Add blank line after command output
    } catch {
      // Continue with remaining charts on error
      console.log(); // Add blank line after error output
    }
  }
}

export function createUninstallCommand(config: ArkConfig) {
  const command = new Command('uninstall');

  command
    .description('Uninstall ARK components using Helm')
    .argument('[service]', 'specific service to uninstall, or all if omitted')
    .option('-y, --yes', 'automatically confirm all uninstallations')
    .option('-v, --verbose', 'show commands being executed')
    .action(async (service, options) => {
      await uninstallArk(config, service, options);
    });

  return command;
}
