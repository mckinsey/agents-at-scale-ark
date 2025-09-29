import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

async function listRoutes() {
  const namespace = 'ark-system';
  const port = 8080;
  const portSuffix = `:${port}`;

  try {
    // Check if localhost-gateway is installed
    const {stdout: gatewayCheck} = await execa(
      'kubectl',
      ['get', 'gateway', 'localhost-gateway', '-n', namespace],
      {reject: false}
    );

    if (!gatewayCheck) {
      output.error("localhost-gateway not installed in namespace 'ark-system'");
      output.info("run 'ark install' first");
      process.exit(1);
    }

    // Get HTTPRoutes
    const {stdout: routeOutput} = await execa(
      'kubectl',
      [
        'get',
        'httproutes',
        '-A',
        '-o',
        'custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,HOSTNAMES:.spec.hostnames',
        '--no-headers',
      ],
      {reject: false}
    );

    if (!routeOutput || routeOutput.trim() === '') {
      console.log(chalk.white('available localhost gateway routes: 0'));
      output.info('no httproutes found. install services to see routes here.');
      return;
    }

    // Parse routes
    const lines = routeOutput.trim().split('\n');
    const routes: Array<{name: string; hostnames: string[]}> = [];

    lines.forEach((line) => {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const name = parts[1];
        // Remove brackets and split hostnames
        const hostnamesStr = parts.slice(2).join(' ').replace(/\[|\]/g, '');
        const hostnames = hostnamesStr
          .split(',')
          .map((h) => h.trim())
          .filter((h) => h && h !== '<none>');

        if (hostnames.length > 0) {
          routes.push({name, hostnames});
        }
      }
    });

    // Count total routes (each hostname counts as a route)
    const routeCount = routes.reduce(
      (count, r) => count + r.hostnames.length,
      0
    );
    console.log(
      chalk.white(`available localhost gateway routes: ${routeCount}`)
    );

    // Check port-forward status
    const {stdout: psOutput} = await execa(
      'pgrep',
      ['-f', `kubectl.*port-forward.*${port}:80`],
      {reject: false}
    );

    const portForwardActive = !!psOutput;

    if (portForwardActive) {
      output.info(`port-forward active on localhost${portSuffix}`);
    } else {
      output.error(
        `port-forward not running on localhost${portSuffix} - routes are not exposed`
      );
      console.log(
        chalk.blue('run:'),
        `kubectl port-forward -n ${namespace} service/localhost-gateway-nginx ${port}:80 > /dev/null 2>&1 &`
      );
    }
    console.log();

    // Display routes
    if (routes.length > 0) {
      const maxLength = Math.max(...routes.map((r) => r.name.length));

      routes.forEach((route) => {
        route.hostnames.forEach((hostname) => {
          const url = `http://${hostname}${portSuffix}/`;
          const padding = ' '.repeat(maxLength - route.name.length);

          if (portForwardActive) {
            console.log(`  ${route.name}${padding}: ${chalk.blue(url)}`);
          } else {
            console.log(
              `  ${route.name}${padding}: ${chalk.blue(url)} ${chalk.red('(unavailable)')}`
            );
          }
        });
      });
    }
  } catch (error) {
    output.error(
      'failed to fetch routes:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exit(1);
  }
}

export function createRoutesCommand(_: ArkConfig) {
  const command = new Command('routes');

  command
    .description('show available gateway routes and their urls')
    .action(async () => {
      await listRoutes();
    });

  return command;
}
