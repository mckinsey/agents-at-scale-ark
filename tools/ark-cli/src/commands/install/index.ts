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
  type ArkService,
} from '../../arkServices.js';
import {isArkReady} from '../../lib/arkStatus.js';
import {printNextSteps} from '../../lib/nextSteps.js';
import ora from 'ora';

async function installService(service: ArkService, verbose: boolean = false) {
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
      {
        name: `ark-controller ${chalk.gray('- Core Ark controller')}`,
        value: 'ark-controller',
        checked: true,
      },
      new inquirer.Separator(chalk.bold('──── Ark Services ────')),
      {
        name: `ark-api ${chalk.gray('- API service')}`,
        value: 'ark-api',
        checked: true,
      },
      {
        name: `ark-dashboard ${chalk.gray('- Web dashboard')}`,
        value: 'ark-dashboard',
        checked: true,
      },
      {
        name: `ark-mcp ${chalk.gray('- MCP services')}`,
        value: 'ark-mcp',
        checked: true,
      },
      {
        name: `localhost-gateway ${chalk.gray('- Gateway for local access')}`,
        value: 'localhost-gateway',
        checked: true,
      },
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
    const services = getInstallableServices();
    for (const service of Object.values(services)) {
      // Check if this service was selected
      const serviceKey = service.helmReleaseName;
      if (!selectedComponents.includes(serviceKey)) {
        continue;
      }

      output.info(`installing ${service.name}...`);
      try {
        await installService(service, options.verbose);

        console.log(); // Add blank line after command output
      } catch {
        // Continue with remaining services on error
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
        await installService(service, options.verbose);
        console.log(); // Add blank line after command output
      } catch {
        // Continue with remaining services on error
        console.log(); // Add blank line after error output
      }
    }
  }

  // Show next steps after successful installation
  if (!serviceName || serviceName === 'all') {
    printNextSteps();
  }

  // Wait for Ark to be ready if requested
  if (options.waitForReady) {
    // Parse timeout value (e.g., '30s', '2m', '60')
    const parseTimeout = (value: string): number => {
      const match = value.match(/^(\d+)([sm])?$/);
      if (!match) {
        throw new Error('Invalid timeout format. Use format like 30s or 2m');
      }
      const num = parseInt(match[1], 10);
      const unit = match[2] || 's';
      return unit === 'm' ? num * 60 : num;
    };

    try {
      const timeoutSeconds = parseTimeout(options.waitForReady);
      const startTime = Date.now();
      const endTime = startTime + timeoutSeconds * 1000;

      const spinner = ora(
        `Waiting for Ark to be ready (timeout: ${timeoutSeconds}s)...`
      ).start();

      while (Date.now() < endTime) {
        if (await isArkReady()) {
          spinner.succeed('Ark is ready!');
          return;
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        spinner.text = `Waiting for Ark to be ready (${elapsed}/${timeoutSeconds}s)...`;

        // Wait 2 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Timeout reached
      spinner.fail(`Ark did not become ready within ${timeoutSeconds} seconds`);
      process.exit(1);
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
