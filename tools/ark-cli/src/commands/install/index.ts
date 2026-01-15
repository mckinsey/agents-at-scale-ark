import {Command} from 'commander';
import chalk from 'chalk';
import {execute} from '../../lib/commands.js';
import inquirer from 'inquirer';
import type {ArkConfig} from '../../lib/config.js';
import {showNoClusterError} from '../../lib/startup.js';
import output from '../../lib/output.js';
import {
  getInstallableServices,
  arkDependencies,
  arkServices,
  type ArkService,
} from '../../arkServices.js';
import {
  isMarketplaceService,
  getMarketplaceItem,
  getAllMarketplaceServices,
  getAllMarketplaceAgents,
} from '../../marketplaceServices.js';
import {printNextSteps} from '../../lib/nextSteps.js';
import ora from 'ora';
import {
  waitForServicesReady,
  type WaitProgress,
} from '../../lib/waitForReady.js';
import {parseTimeoutToSeconds} from '../../lib/timeout.js';

async function uninstallPrerequisites(service: ArkService, verbose: boolean = false) {
  if (!service.prerequisiteUninstalls?.length) return;

  for (const prereq of service.prerequisiteUninstalls) {
    const helmArgs = ['uninstall', prereq.releaseName, '--ignore-not-found'];
    if (prereq.namespace) {
      helmArgs.push('--namespace', prereq.namespace);
    }
    await execute('helm', helmArgs, {stdio: 'inherit'}, {verbose});
  }
}

async function installService(service: ArkService, verbose: boolean = false) {
  await uninstallPrerequisites(service, verbose);

  const helmArgs = [
    'upgrade',
    '--install',
    service.helmReleaseName,
    service.chartPath!,
  ];

  // Only add namespace flag if service has explicit namespace
  if (service.namespace) {
    helmArgs.push('--namespace', service.namespace);
  }

  // Add any additional install args
  helmArgs.push(...(service.installArgs || []));

  await execute('helm', helmArgs, {stdio: 'inherit'}, {verbose});
}

export async function installArk(
  config: ArkConfig,
  serviceName?: string,
  options: {yes?: boolean; waitForReady?: string; verbose?: boolean} = {}
) {
  // Validate that --wait-for-ready requires -y
  if (options.waitForReady && !options.yes) {
    output.error('--wait-for-ready requires -y flag for non-interactive mode');
    process.exit(1);
  }

  // Check cluster connectivity from config
  if (!config.clusterInfo) {
    showNoClusterError();
    process.exit(1);
  }

  const clusterInfo = config.clusterInfo;

  // Show cluster info
  output.success(`connected to cluster: ${chalk.bold(clusterInfo.context)}`);
  console.log(); // Add blank line after cluster info

  // If a specific service is requested, install only that service
  if (serviceName) {
    // Check if it's a marketplace item
    if (isMarketplaceService(serviceName)) {
      const service = await getMarketplaceItem(serviceName);

      if (!service) {
        output.error(
          `marketplace item '${serviceName}' not found`
        );
        output.info('available marketplace items:');
        const marketplaceServices = await getAllMarketplaceServices();
        if (marketplaceServices) {
          for (const name of Object.keys(marketplaceServices)) {
            output.info(`  marketplace/services/${name}`);
          }
        }
        const marketplaceAgents = await getAllMarketplaceAgents();
        if (marketplaceAgents) {
          for (const name of Object.keys(marketplaceAgents)) {
            output.info(`  marketplace/agents/${name}`);
          }
        }
        if (!marketplaceServices && !marketplaceAgents) {
          output.warning('Marketplace unavailable');
        }
        process.exit(1);
      }

      output.info(`installing marketplace item ${service.name}...`);
      try {
        await installService(service, options.verbose);
        output.success(`${service.name} installed successfully`);
      } catch (error) {
        output.error(`failed to install ${service.name}`);
        console.error(error);
        process.exit(1);
      }
      return;
    }

    // Core ARK service
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

    output.info(`installing ${service.name}...`);
    try {
      await installService(service, options.verbose);
      output.success(`${service.name} installed successfully`);
    } catch (error) {
      output.error(`failed to install ${service.name}`);
      console.error(error);
      process.exit(1);
    }
    return;
  }

  // If not using -y flag, show checklist interface
  if (!options.yes) {
    console.log(chalk.cyan.bold('\nSelect components to install:'));
    console.log(
      chalk.gray(
        'Use arrow keys to navigate, space to toggle, enter to confirm\n'
      )
    );

    // Build choices for the checkbox prompt
    const coreServices = Object.values(arkServices)
      .filter((s) => s.category === 'core')
      .sort((a, b) => a.name.localeCompare(b.name));

    const otherServices = Object.values(arkServices)
      .filter((s) => s.category === 'service')
      .sort((a, b) => a.name.localeCompare(b.name));

    const allChoices = [
      new inquirer.Separator(chalk.bold('──── Dependencies ────')),
      {
        name: `cert-manager ${chalk.gray('- Certificate management')}`,
        value: 'cert-manager',
        checked: true,
      },
      {
        name: `gateway-api ${chalk.gray('- Gateway API CRDs')}`,
        value: 'gateway-api',
        checked: true,
      },
      new inquirer.Separator(chalk.bold('──── Ark Core ────')),
      ...coreServices.map((service) => ({
        name: `${service.name} ${chalk.gray(`- ${service.description}`)}`,
        value: service.helmReleaseName,
        checked: Boolean(service.enabled),
      })),
      new inquirer.Separator(chalk.bold('──── Ark Services ────')),
      ...otherServices.map((service) => ({
        name: `${service.name} ${chalk.gray(`- ${service.description}`)}`,
        value: service.helmReleaseName,
        checked: Boolean(service.enabled),
      })),
    ];

    let selectedComponents: string[] = [];
    try {
      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'components',
          message: 'Components to install:',
          choices: allChoices,
          pageSize: 15,
        },
      ]);
      selectedComponents = answers.components;

      if (selectedComponents.length === 0) {
        output.warning('No components selected. Exiting.');
        process.exit(0);
      }
    } catch (error) {
      // Handle Ctrl-C gracefully
      if (error && (error as {name?: string}).name === 'ExitPromptError') {
        console.log('\nInstallation cancelled');
        process.exit(130);
      }
      throw error;
    }

    // Install dependencies if selected
    const shouldInstallDeps =
      selectedComponents.includes('cert-manager') ||
      selectedComponents.includes('gateway-api');

    // Install selected dependencies
    if (shouldInstallDeps) {
      // Always install cert-manager repo and update if installing any dependency
      if (
        selectedComponents.includes('cert-manager') ||
        selectedComponents.includes('gateway-api')
      ) {
        for (const depKey of ['cert-manager-repo', 'helm-repo-update']) {
          const dep = arkDependencies[depKey];
          output.info(`installing ${dep.description || dep.name}...`);
          try {
            await execute(
              dep.command,
              dep.args,
              {
                stdio: 'inherit',
              },
              {verbose: options.verbose}
            );
            output.success(`${dep.name} completed`);
            console.log();
          } catch {
            console.log();
            process.exit(1);
          }
        }
      }

      // Install cert-manager if selected
      if (selectedComponents.includes('cert-manager')) {
        const dep = arkDependencies['cert-manager'];
        output.info(`installing ${dep.description || dep.name}...`);
        try {
          await execute(
            dep.command,
            dep.args,
            {
              stdio: 'inherit',
            },
            {verbose: options.verbose}
          );
          output.success(`${dep.name} completed`);
          console.log();
        } catch {
          console.log();
          process.exit(1);
        }
      }

      // Install gateway-api if selected
      if (selectedComponents.includes('gateway-api')) {
        const dep = arkDependencies['gateway-api-crds'];
        output.info(`installing ${dep.description || dep.name}...`);
        try {
          await execute(
            dep.command,
            dep.args,
            {
              stdio: 'inherit',
            },
            {verbose: options.verbose}
          );
          output.success(`${dep.name} completed`);
          console.log();
        } catch {
          console.log();
          process.exit(1);
        }
      }
    }

    // Install selected services
    for (const serviceName of selectedComponents) {
      const service = Object.values(arkServices).find(
        (s) => s.helmReleaseName === serviceName
      );
      if (!service || !service.chartPath) {
        continue;
      }

      output.info(`installing ${service.name}...`);
      try {
        await installService(service, options.verbose);

        console.log(); // Add blank line after command output
      } catch {
        console.log(); // Add blank line after error output
        process.exit(1);
      }
    }
  } else {
    // -y flag was used, install everything
    // Install all dependencies
    for (const dep of Object.values(arkDependencies)) {
      output.info(`installing ${dep.description || dep.name}...`);

      try {
        await execute(
          dep.command,
          dep.args,
          {
            stdio: 'inherit',
          },
          {verbose: options.verbose}
        );
        output.success(`${dep.name} completed`);
        console.log(); // Add blank line after dependency
      } catch {
        console.log(); // Add blank line after error
        process.exit(1);
      }
    }

    // Install all services
    const services = getInstallableServices();
    for (const service of Object.values(services)) {
      output.info(`installing ${service.name}...`);

      try {
        await installService(service, options.verbose);
        console.log(); // Add blank line after command output
      } catch {
        console.log(); // Add blank line after error output
        process.exit(1);
      }
    }
  }

  // Show next steps after successful installation
  if (!serviceName || serviceName === 'all') {
    printNextSteps();
  }

  // Wait for Ark to be ready if requested
  if (options.waitForReady) {
    try {
      const timeoutSeconds = parseTimeoutToSeconds(options.waitForReady);

      const servicesToWait = Object.values(arkServices).filter(
        (s) =>
          s.enabled &&
          s.category === 'core' &&
          s.k8sDeploymentName &&
          s.namespace
      );

      const spinner = ora(
        `Waiting for Ark to be ready (timeout: ${timeoutSeconds}s)...`
      ).start();

      const statusMap = new Map<string, boolean>();
      servicesToWait.forEach((s) => statusMap.set(s.name, false));

      const startTime = Date.now();
      const result = await waitForServicesReady(
        servicesToWait,
        timeoutSeconds,
        (progress: WaitProgress) => {
          statusMap.set(progress.serviceName, progress.ready);

          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const lines = servicesToWait.map((s) => {
            const ready = statusMap.get(s.name);
            const icon = ready ? '✓' : '⋯';
            const status = ready ? 'ready' : 'waiting...';
            const color = ready ? chalk.green : chalk.yellow;
            return `  ${color(icon)} ${chalk.bold(s.name)} ${chalk.blue(`(${s.namespace})`)} - ${status}`;
          });

          spinner.text = `Waiting for Ark to be ready (${elapsed}/${timeoutSeconds}s)...\n${lines.join('\n')}`;
        }
      );

      if (result) {
        spinner.succeed('Ark is ready');
      } else {
        spinner.fail(
          `Ark did not become ready within ${timeoutSeconds} seconds`
        );
        process.exit(1);
      }
    } catch (error) {
      output.error(
        `Failed to wait for ready: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  }
}

export function createInstallCommand(config: ArkConfig) {
  const command = new Command('install');

  command
    .description('Install ARK components using Helm')
    .argument('[service]', 'specific service to install, or all if omitted')
    .option('-y, --yes', 'automatically confirm all installations')
    .option(
      '--wait-for-ready <timeout>',
      'wait for Ark to be ready after installation (e.g., 30s, 2m)'
    )
    .option('-v, --verbose', 'show commands being executed')
    .action(async (service, options) => {
      await installArk(config, service, options);
    });

  return command;
}
