import {execute, checkCommandExists} from './commands.js';
import output from './output.js';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function isMicroK8sInstalled(): Promise<boolean> {
  return await checkCommandExists('microk8s', ['status']);
}

export async function configureMicroK8s(verbose: boolean = false) {
  const spinner = ora('Configuring MicroK8s...').start();

  try {
    // Wait for microk8s to be ready
    spinner.text = 'Waiting for MicroK8s to be ready...';
    await execute(
      'microk8s',
      ['status', '--wait-ready'],
      {},
      {verbose: verbose}
    );

    // Enable required addons
    spinner.text = 'Enabling required addons...';
    await execute(
      'microk8s',
      ['enable', 'dns', 'helm', 'ingress', 'registry', 'hostpath-storage', 'metrics-server'],
      {},
      {verbose: verbose}
    );

    // Configure kubeconfig
    spinner.text = 'Configuring kubeconfig...';
    const {stdout: kubeconfig} = await execute(
      'microk8s',
      ['config'],
      {},
      {verbose: verbose}
    );

    if (typeof kubeconfig !== 'string') {
      throw new Error('Failed to retrieve kubeconfig from microk8s');
    }

    // Write to ~/.kube/config
    const kubeDir = path.join(os.homedir(), '.kube');
    const kubeConfigPath = path.join(kubeDir, 'config');

    await fs.mkdir(kubeDir, {recursive: true});

    // Backup existing config if it exists
    try {
      await fs.access(kubeConfigPath);
      const backupPath = `${kubeConfigPath}.backup-${Date.now()}`;
      await fs.copyFile(kubeConfigPath, backupPath);
      output.info(`Backed up existing kubeconfig to ${backupPath}`);
    } catch {
      // No existing config, ignore
    }

    await fs.writeFile(kubeConfigPath, kubeconfig);
    await fs.chmod(kubeConfigPath, 0o600);

    spinner.succeed('MicroK8s configured successfully');
  } catch (error) {
    spinner.fail('Failed to configure MicroK8s');
    throw error;
  }
}
