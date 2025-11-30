import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

// Helper function to run kubectl commands, similar to execa but with custom options
async function runCommand(
  args: string[],
  options: {showOutput: boolean; showCommand: boolean} = {
    showOutput: true,
    showCommand: true,
  }
) {
  const command = 'kubectl';
  if (options.showCommand) {
    output.info(`Running: ${command} ${args.join(' ')}`);
  }
  try {
    const {stdout, stderr, exitCode} = await execa(command, args, {
      reject: false,
    });
    if (options.showOutput && stdout) {
      console.log(stdout);
    }
    if (stderr) {
      output.error(stderr);
    }
    return {stdout, stderr, exitCode};
  } catch (error) {
    output.error(`Command failed: ${command} ${args.join(' ')}`);
    output.error(error instanceof Error ? error.message : String(error));
    return {stdout: '', stderr: String(error), exitCode: 1};
  }
}

async function listRoutes() {
  const namespace = 'ark-system';
  const port = 8080;
  const portSuffix = `:${port}`;

  try {
    // Check for Ingress routes
    const ingressRoutes = await runCommand(
      ['get', 'ingress', '-A', '--no-headers'],
      {showOutput: false, showCommand: false}
    );

    if (ingressRoutes.exitCode !== 0 || !ingressRoutes.stdout.trim()) {
      output.warning('No Ingress routes found.');
    } else {
      output.success('Ingress routes found:');
      console.log(ingressRoutes.stdout);
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

    // Check port-forward status - NOT NEEDED for MicroK8s Ingress
    // MicroK8s Ingress is usually exposed on localhost:80 or the VM IP
    
    // Display routes
    if (routes.length > 0) {
      const maxLength = Math.max(...routes.map((r) => r.name.length));

      routes.forEach((route) => {
        route.hostnames.forEach((hostname) => {
          const url = `http://${hostname}/`;
          const padding = ' '.repeat(maxLength - route.name.length);
          console.log(`  ${route.name}${padding}: ${chalk.blue(url)}`);
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
