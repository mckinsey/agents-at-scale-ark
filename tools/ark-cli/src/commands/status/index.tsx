import {Command} from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {StatusChecker} from '../../components/statusChecker.js';
import {
  StatusFormatter,
  StatusSection,
  StatusColor,
} from '../../ui/statusFormatter.js';
import {StatusData, ServiceStatus} from '../../lib/types.js';
import {fetchVersionInfo} from '../../lib/versions.js';
import type {ArkVersionInfo} from '../../lib/versions.js';
import {
  waitForServicesReady,
  type WaitProgress,
} from '../../lib/waitForReady.js';
import {arkServices} from '../../arkServices.js';
import type {ArkService} from '../../types/arkService.js';
import output from '../../lib/output.js';
import {parseTimeoutToSeconds} from '../../lib/timeout.js';

/**
 * Enrich service with formatted details including version/revision
 */
function enrichServiceDetails(service: ServiceStatus): {
  statusInfo: {icon: string; text: string; color: StatusColor};
  displayName: string;
  details: string;
} {
  const statusMap: Record<
    string,
    {icon: string; text: string; color: StatusColor}
  > = {
    healthy: {icon: '✓', text: 'healthy', color: 'green'},
    unhealthy: {icon: '✗', text: 'unhealthy', color: 'red'},
    warning: {icon: '⚠', text: 'warning', color: 'yellow'},
    'not ready': {icon: '○', text: 'not ready', color: 'yellow'},
    'not installed': {icon: '?', text: 'not installed', color: 'yellow'},
  };
  const statusInfo = statusMap[service.status] || {
    icon: '?',
    text: service.status,
    color: 'yellow' as StatusColor,
  };

  // Build details array
  const details = [];
  if (service.status === 'healthy') {
    if (service.version) details.push(service.version);
    if (service.revision) details.push(`revision ${service.revision}`);
  }
  if (service.details) details.push(service.details);

  // Build display name with formatting
  let displayName = chalk.bold(service.name);
  if (service.namespace) {
    displayName += ` ${chalk.blue(service.namespace)}`;
  }
  if (service.isDev) {
    displayName += ' (dev)';
  }

  return {
    statusInfo,
    displayName,
    details: details.join(', '),
  };
}

function buildStatusSections(
  data: StatusData & {clusterAccess?: boolean; clusterInfo?: any},
  versionInfo?: ArkVersionInfo
): StatusSection[] {
  const sections: StatusSection[] = [];

  // Dependencies section
  sections.push({
    title: 'system dependencies:',
    lines: data.dependencies.map((dep) => ({
      icon: dep.installed ? '✓' : '✗',
      iconColor: (dep.installed ? 'green' : 'red') as StatusColor,
      status: dep.installed ? 'installed' : 'missing',
      statusColor: (dep.installed ? 'green' : 'red') as StatusColor,
      name: chalk.bold(dep.name),
      details: dep.version || '',
      subtext: dep.installed ? undefined : dep.details,
    })),
  });

  // Cluster access section
  const clusterLines = [];
  if (data.clusterAccess) {
    const contextName = data.clusterInfo?.context || 'kubernetes cluster';
    const namespace = data.clusterInfo?.namespace || 'default';
    // Add bold context name with blue namespace
    const name = `${chalk.bold(contextName)} ${chalk.blue(namespace)}`;
    const details = [];
    if (data.clusterInfo?.type && data.clusterInfo.type !== 'unknown') {
      details.push(data.clusterInfo.type);
    }
    if (data.clusterInfo?.ip) {
      details.push(data.clusterInfo.ip);
    }
    clusterLines.push({
      icon: '✓',
      iconColor: 'green' as StatusColor,
      status: 'accessible',
      statusColor: 'green' as StatusColor,
      name,
      details: details.join(', '),
    });
  } else {
    clusterLines.push({
      icon: '✗',
      iconColor: 'red' as StatusColor,
      status: 'unreachable',
      statusColor: 'red' as StatusColor,
      name: 'kubernetes cluster',
      subtext: 'Install minikube: https://minikube.sigs.k8s.io/docs/start',
    });
  }
  sections.push({title: 'cluster access:', lines: clusterLines});

  // Ark services section
  if (data.clusterAccess) {
    const serviceLines = data.services
      .filter((s) => s.name !== 'ark-controller')
      .map((service) => {
        const {statusInfo, displayName, details} =
          enrichServiceDetails(service);
        return {
          icon: statusInfo.icon,
          iconColor: statusInfo.color,
          status: statusInfo.text,
          statusColor: statusInfo.color,
          name: displayName,
          details: details,
        };
      });
    sections.push({title: 'ark services:', lines: serviceLines});
  } else {
    sections.push({
      title: 'ark services:',
      lines: [
        {
          icon: '',
          status: '',
          name: 'Cannot check ARK services - cluster not accessible',
        },
      ],
    });
  }

  // Ark status section
  const arkStatusLines = [];
  if (!data.clusterAccess) {
    arkStatusLines.push({
      icon: '✗',
      iconColor: 'red' as StatusColor,
      status: 'no cluster access',
      statusColor: 'red' as StatusColor,
      name: '',
    });
  } else {
    const controller = data.services?.find((s) => s.name === 'ark-controller');
    if (!controller) {
      arkStatusLines.push({
        icon: '○',
        iconColor: 'yellow' as StatusColor,
        status: 'not ready',
        statusColor: 'yellow' as StatusColor,
        name: 'ark-controller',
      });
    } else {
      const {statusInfo, displayName, details} =
        enrichServiceDetails(controller);

      // Map service status to ark status display
      const statusText =
        controller.status === 'healthy'
          ? 'ready'
          : controller.status === 'not installed'
            ? 'not ready'
            : controller.status;

      arkStatusLines.push({
        icon: statusInfo.icon,
        iconColor: statusInfo.color,
        status: statusText,
        statusColor: statusInfo.color,
        name: displayName,
        details: details,
      });

      // Add version update status as separate line
      if (controller.status === 'healthy' && versionInfo) {
        const currentVersion = versionInfo.current || controller.version;

        if (!currentVersion) {
          // Version is unknown
          arkStatusLines.push({
            icon: '?',
            iconColor: 'yellow' as StatusColor,
            status: 'version unknown',
            statusColor: 'yellow' as StatusColor,
            name: '',
            details: versionInfo.latest
              ? `latest: ${versionInfo.latest}`
              : 'unable to determine version',
          });
        } else if (versionInfo.latest === undefined) {
          // Have current version but couldn't check for updates
          arkStatusLines.push({
            icon: '?',
            iconColor: 'yellow' as StatusColor,
            status: `version ${currentVersion}`,
            statusColor: 'yellow' as StatusColor,
            name: '',
            details: 'unable to check for updates',
          });
        } else {
          // Have both current and latest versions
          if (currentVersion === versionInfo.latest) {
            arkStatusLines.push({
              icon: '✓',
              iconColor: 'green' as StatusColor,
              status: 'up to date',
              statusColor: 'green' as StatusColor,
              name: '',
              details: versionInfo.latest,
            });
          } else {
            arkStatusLines.push({
              icon: '↑',
              iconColor: 'yellow' as StatusColor,
              status: 'update available',
              statusColor: 'yellow' as StatusColor,
              name: '',
              details: `${currentVersion} → ${versionInfo.latest}`,
            });
          }
        }
      }

      // Add default model status
      if (data.defaultModel) {
        if (!data.defaultModel.exists) {
          arkStatusLines.push({
            icon: '○',
            iconColor: 'yellow' as StatusColor,
            status: 'default model',
            statusColor: 'yellow' as StatusColor,
            name: '',
            details: 'not configured',
          });
        } else if (data.defaultModel.available) {
          arkStatusLines.push({
            icon: '●',
            iconColor: 'green' as StatusColor,
            status: 'default model',
            statusColor: 'green' as StatusColor,
            name: '',
            details: data.defaultModel.provider || 'configured',
          });
        } else {
          arkStatusLines.push({
            icon: '●',
            iconColor: 'yellow' as StatusColor,
            status: 'default model',
            statusColor: 'yellow' as StatusColor,
            name: '',
            details: 'not available',
          });
        }
      }
    }
  }
  sections.push({title: 'ark status:', lines: arkStatusLines});

  return sections;
}

export async function checkStatus(
  serviceNames?: string[],
  options?: {waitForReady?: string}
) {
  const spinner = ora('Checking system status').start();

  try {
    spinner.text = 'Checking system dependencies';
    const statusChecker = new StatusChecker();

    spinner.text = 'Testing cluster access';

    spinner.text = 'Checking ARK services';

    // Run status check and version fetch in parallel
    const [statusData, versionInfo] = await Promise.all([
      statusChecker.checkAll(),
      fetchVersionInfo(),
    ]);

    spinner.stop();

    const sections = buildStatusSections(statusData, versionInfo);
    StatusFormatter.printSections(sections);

    if (options?.waitForReady) {
      const timeoutSeconds = parseTimeoutToSeconds(options.waitForReady);

      let servicesToWait: ArkService[] = [];
      if (serviceNames && serviceNames.length > 0) {
        servicesToWait = serviceNames
          .map((name) =>
            Object.values(arkServices).find((s) => s.name === name)
          )
          .filter(
            (s): s is ArkService =>
              s !== undefined &&
              s.k8sDeploymentName !== undefined &&
              s.namespace !== undefined
          );

        if (servicesToWait.length === 0) {
          output.error(
            `No valid services found matching: ${serviceNames.join(', ')}`
          );
          process.exit(1);
        }
      } else {
        servicesToWait = Object.values(arkServices).filter(
          (s) =>
            s.enabled &&
            s.category === 'core' &&
            s.k8sDeploymentName &&
            s.namespace
        );
      }

      console.log();
      const waitSpinner = ora(
        `Waiting for services to be ready (timeout: ${timeoutSeconds}s)...`
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

          waitSpinner.text = `Waiting for services to be ready (${elapsed}/${timeoutSeconds}s)...\n${lines.join('\n')}`;
        }
      );

      if (result) {
        waitSpinner.succeed('All services are ready');
        process.exit(0);
      } else {
        waitSpinner.fail(
          `Services did not become ready within ${timeoutSeconds} seconds`
        );
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (error) {
    spinner.fail('Failed to check status');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

export function createStatusCommand(): Command {
  const statusCommand = new Command('status');
  statusCommand
    .description('Check ARK system status')
    .argument('[services...]', 'specific services to check (optional)')
    .option(
      '--wait-for-ready [timeout]',
      'wait for services to be ready, e.g, 30s, 2m, 1h (default: 30m)'
    )
    .action((services, options) => {
      if (options.waitForReady === true) {
        options.waitForReady = '30m';
      }
      checkStatus(services, options);
    });

  return statusCommand;
}
