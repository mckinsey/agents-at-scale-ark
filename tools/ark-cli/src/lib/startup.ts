import chalk from 'chalk';
import {execa} from 'execa';
import {checkCommandExists} from './commands.js';
import {loadConfig} from './config.js';
import type {ArkConfig} from './config.js';

interface RequiredCommand {
  name: string;
  command: string;
  args: string[];
  installUrl: string;
}

const REQUIRED_COMMANDS: RequiredCommand[] = [
  {
    name: 'kubectl',
    command: 'kubectl',
    args: ['version', '--client'],
    installUrl: 'https://kubernetes.io/docs/tasks/tools/',
  },
  {
    name: 'helm',
    command: 'helm',
    args: ['version', '--short'],
    installUrl: 'https://helm.sh/docs/intro/install/',
  },
];

async function checkRequirements(): Promise<void> {
  const missing: RequiredCommand[] = [];

  for (const cmd of REQUIRED_COMMANDS) {
    const exists = await checkCommandExists(cmd.command, cmd.args);
    if (!exists) {
      missing.push(cmd);
    }
  }

  if (missing.length > 0) {
    for (const cmd of missing) {
      console.error(chalk.red('error:') + ` ${cmd.name} is required`);
      console.error('  ' + chalk.blue(cmd.installUrl));
    }
    process.exit(1);
  }
}

/**
 * Show error message when no cluster is detected
 */
export function showNoClusterError(): void {
  console.log(chalk.red.bold('\n✗ No Kubernetes cluster detected\n'));
  console.log(
    'Please ensure you have configured a connection to a Kubernetes cluster.'
  );
  console.log('For local development, you can use:');
  console.log(
    `  • Minikube: ${chalk.blue('https://minikube.sigs.k8s.io/docs/start')}`
  );
  console.log(
    `  • Docker Desktop: ${chalk.blue('https://docs.docker.com/desktop/kubernetes/')}`
  );
  console.log(
    `  • Kind: ${chalk.blue('https://kind.sigs.k8s.io/docs/user/quick-start/')}`
  );
  console.log('');
  console.log('And more. For help, check the Quickstart guide:');
  console.log(
    chalk.blue('  https://mckinsey.github.io/agents-at-scale-ark/quickstart/')
  );
}

/**
 * Check if a Kubernetes context is configured
 * This is a fast local check that doesn't hit the cluster
 */
async function hasKubernetesContext(): Promise<boolean> {
  try {
    const {stdout} = await execa('kubectl', ['config', 'current-context'], {
      timeout: 5000,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Initialize the CLI with minimal checks for fast startup
 */
export async function startup(): Promise<ArkConfig> {
  // Check required commands (kubectl, helm) - fast local checks
  await checkRequirements();

  // Load config from disk (fast - just file I/O)
  const config = loadConfig();

  // Check if we have a kubernetes context configured (fast local check)
  // We don't check cluster connectivity here - that's expensive
  const hasContext = await hasKubernetesContext();
  if (hasContext) {
    try {
      const {stdout} = await execa('kubectl', ['config', 'current-context'], {
        timeout: 5000,
      });
      config.clusterInfo = {
        type: 'unknown', // We don't detect cluster type here - too slow
        context: stdout.trim(),
        // We don't fetch namespace or cluster details here - too slow
      };
    } catch {
      // Ignore - no context
    }
  }

  return config;
}
