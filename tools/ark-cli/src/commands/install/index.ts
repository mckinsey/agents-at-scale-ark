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
  getAllMarketplaceExecutors,
} from '../../marketplaceServices.js';
import {printNextSteps} from '../../lib/nextSteps.js';
import ora from 'ora';
import {
  waitForServicesReady,
  type WaitProgress,
} from '../../lib/waitForReady.js';
import {parseTimeoutToSeconds} from '../../lib/timeout.js';

function isValidVersion(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
}

function isVersionNotFoundError(
  error: unknown,
  options: {
    arkVersion?: string;
    marketplaceVersion?: string;
  }
): boolean {
  let errorMsg = '';

  if (error && typeof error === 'object') {
    const err = error as any;
    // Check stderr first (execa captures this with pipe), then message
    errorMsg = err.stderr || err.message || String(error);
  } else {
    errorMsg = String(error);
  }

  if (options.arkVersion && errorMsg.includes(`:${options.arkVersion}: not found`)) {
    return true;
  }

  if (options.marketplaceVersion && errorMsg.includes(`:${options.marketplaceVersion}: not found`)) {
    return true;
  }

  return false;
}

function handleInstallError(
  error: unknown,
  service: ArkService,
  options: {
    arkVersion?: string;
    marketplaceVersion?: string;
  }
): boolean {
  if (isVersionNotFoundError(error, options)) {
    const version = options.arkVersion || options.marketplaceVersion;
    output.warning(`${service.name} version ${version} not found, skipping...`);
    return true; // should continue to next service
  }

  // Other errors still fail
  output.error(`failed to install ${service.name}`);
  console.error(error);
  process.exit(1);
}

async function uninstallPrerequisites(
  service: ArkService,
  verbose: boolean = false
) {
  if (!service.prerequisiteUninstalls?.length) return;

  for (const prereq of service.prerequisiteUninstalls) {
    const helmArgs = ['uninstall', prereq.releaseName, '--ignore-not-found'];
    if (prereq.namespace) {
      helmArgs.push('--namespace', prereq.namespace);
    }
    await execute('helm', helmArgs, {stdio: 'inherit'}, {verbose});
  }
}

async function checkAndCleanFailedRelease(
  releaseName: string,
  namespace?: string,
  verbose: boolean = false
) {
  const statusArgs = ['status', releaseName];
  if (namespace) {
    statusArgs.push('--namespace', namespace);
  }

  try {
    const result = await execute('helm', statusArgs, {}, {verbose: false});

    const stdout = String(result.stdout || '');
    if (
      stdout.includes('STATUS: pending-install') ||
      stdout.includes('STATUS: failed') ||
      stdout.includes('STATUS: uninstalling')
    ) {
      const uninstallArgs = ['uninstall', releaseName];
      if (namespace) {
        uninstallArgs.push('--namespace', namespace);
      }
      await execute('helm', uninstallArgs, {stdio: 'inherit'}, {verbose});
    }
  } catch {
    // Ignore errors - prerequisite may not exist
  }
}

async function installService(
  service: ArkService,
  verbose: boolean = false,
  arkVersionOverride?: string,
  marketplaceVersionOverride?: string
) {
  await uninstallPrerequisites(service, verbose);
  await checkAndCleanFailedRelease(
    service.helmReleaseName,
    service.namespace,
    verbose
  );

  let chartPath = service.chartPath!;

  // Override version for ARK core services
  if (
    arkVersionOverride &&
    chartPath.includes('ghcr.io/mckinsey/agents-at-scale-ark/charts')
  ) {
    chartPath = chartPath.replace(/:[^:]+$/, `:${arkVersionOverride}`);
  }

  // Override version for marketplace items
  if (
    marketplaceVersionOverride &&
    chartPath.includes('ghcr.io/mckinsey/agents-at-scale-marketplace/charts')
  ) {
    // Check if version tag exists after the last slash
    const lastSlashIndex = chartPath.lastIndexOf('/');
    const afterLastSlash = chartPath.slice(lastSlashIndex + 1);
    if (afterLastSlash.includes(':')) {
      // Replace existing version
      chartPath = chartPath.replace(/:[^:/]+$/, `:${marketplaceVersionOverride}`);
    } else {
      // Append version
      chartPath = `${chartPath}:${marketplaceVersionOverride}`;
    }
  }

  const helmArgs = [
    'upgrade',
    '--install',
    service.helmReleaseName,
    chartPath,
  ];

  // Only add namespace flag if service has explicit namespace
  if (service.namespace) {
    helmArgs.push('--namespace', service.namespace);
  }

  // Add any additional install args
  helmArgs.push(...(service.installArgs || []));

  await execute(
    'helm',
    helmArgs,
    {
      stdout: 'inherit',
      stderr: 'pipe',
    },
    {verbose}
  );
}

export async function installArk(
  config: ArkConfig,
  serviceNames: string[] = [],
  options: {
    yes?: boolean;
    waitForReady?: string;
    verbose?: boolean;
    arkVersion?: string;
    marketplaceVersion?: string;
  } = {}
) {
  // Validate version strings
  if (options.arkVersion && !isValidVersion(options.arkVersion)) {
    output.error(`Invalid ARK version format: ${options.arkVersion}. Expected semantic versioning (e.g., 0.1.50)`);
    process.exit(1);
  }

  if (options.marketplaceVersion && !isValidVersion(options.marketplaceVersion)) {
    output.error(`Invalid marketplace version format: ${options.marketplaceVersion}. Expected semantic versioning (e.g., 0.1.7)`);
    process.exit(1);
  }

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

  // If specific services are requested, install only those services
  if (serviceNames.length > 0) {
    for (const serviceName of serviceNames) {
      // Check if it's a marketplace item
      if (isMarketplaceService(serviceName)) {
        const service = await getMarketplaceItem(serviceName);

        if (!service) {
          output.error(`marketplace item '${serviceName}' not found`);
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
          const marketplaceExecutors = await getAllMarketplaceExecutors();
          if (marketplaceExecutors) {
            for (const name of Object.keys(marketplaceExecutors)) {
              output.info(`  marketplace/executors/${name}`);
            }
          }
          if (!marketplaceServices && !marketplaceAgents && !marketplaceExecutors) {
            output.warning('Marketplace unavailable');
          }
          process.exit(1);
        }

        output.info(`installing marketplace item ${service.name}...`);
        try {
          await installService(
            service,
            options.verbose,
            options.arkVersion,
            options.marketplaceVersion
          );
          output.success(`${service.name} installed successfully`);
        } catch (error) {
          if (handleInstallError(error, service, options)) {
            continue;
          }
        }
        continue;
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
        await installService(
          service,
          options.verbose,
          options.arkVersion,
          options.marketplaceVersion
        );
        output.success(`${service.name} installed successfully`);
      } catch (error) {
        if (handleInstallError(error, service, options)) {
          continue;
        }
      }
    }
    return;
  }

  // If not using -y flag, show checklist interface
  if (!options.yes) {
    const coreServices = Object.values(arkServices)
      .filter((s) => s.category === 'core')
      .sort((a, b) => a.name.localeCompare(b.name));

    const otherServices = Object.values(arkServices)
      .filter((s) => s.category === 'service')
      .sort((a, b) => a.name.localeCompare(b.name));

    const mandatoryServiceNames = [...coreServices, ...otherServices]
      .filter((s) => s.mandatory)
      .map((s) => s.helmReleaseName);

    console.log(chalk.cyan.bold('\nSelect components to install:'));
    console.log(
      chalk.gray(
        'Use arrow keys to navigate, space to toggle, enter to confirm\n'
      )
    );

    const formatServiceChoice = (service: ArkService) => {
      if (service.mandatory) {
        return new inquirer.Separator(
          `${chalk.dim.green('◉')} ${chalk.dim(`${service.name} - ${service.description}`)}`
        );
      }
      return {
        name: `${service.name} ${chalk.gray(`- ${service.description}`)}`,
        value: service.helmReleaseName,
        checked: Boolean(service.enabled),
      };
    };

    const allChoices = [
      new inquirer.Separator(chalk.bold('──── Dependencies ────')),
      new inquirer.Separator(
        `${chalk.dim.green('◉')} ${chalk.dim('cert-manager - Certificate management')}`
      ),
      new inquirer.Separator(
        `${chalk.dim.green('◉')} ${chalk.dim('gateway-api - Gateway API CRDs')}`
      ),
      new inquirer.Separator(chalk.bold('──── Ark Core ────')),
      ...coreServices.map(formatServiceChoice),
      new inquirer.Separator(chalk.bold('──── Ark Services ────')),
      ...otherServices.map(formatServiceChoice),
    ];

    let selectedComponents: string[];
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
      selectedComponents = [
        'cert-manager',
        'gateway-api',
        ...mandatoryServiceNames,
        ...answers.components,
      ];
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
        await installService(
          service,
          options.verbose,
          options.arkVersion,
          options.marketplaceVersion
        );

        console.log(); // Add blank line after command output
      } catch (error) {
        if (handleInstallError(error, service, options)) {
          console.log(); // Add blank line after warning
          continue;
        }
        console.log(); // Add blank line after error output
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
        await installService(
          service,
          options.verbose,
          options.arkVersion,
          options.marketplaceVersion
        );
        console.log(); // Add blank line after command output
      } catch (error) {
        if (handleInstallError(error, service, options)) {
          console.log(); // Add blank line after warning
          continue;
        }
        console.log(); // Add blank line after error output
      }
    }
  }

  // Show next steps after successful installation
  if (serviceNames.length === 0) {
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
    .argument('[service...]', 'specific services to install, or all if omitted')
    .option('-y, --yes', 'automatically confirm all installations')
    .option(
      '--ark-version <version>',
      'ARK version to install (e.g., 0.1.50, defaults to CLI version)'
    )
    .option(
      '--marketplace-version <version>',
      'Marketplace item version to install (e.g., 0.1.5)'
    )
    .option(
      '--wait-for-ready <timeout>',
      'wait for Ark to be ready after installation (e.g., 30s, 2m)'
    )
    .option('-v, --verbose', 'show commands being executed')
    .action(async (services, options) => {
      await installArk(config, services, options);
    });

  return command;
}
