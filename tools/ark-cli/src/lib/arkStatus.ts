import {execa} from 'execa';
import {arkServices} from '../arkServices.js';
import type {HelmRelease} from './types.js';

/**
 * Get current installed ARK version
 * @returns version string if found, undefined otherwise
 */
export async function getArkVersion(): Promise<string | undefined> {
  try {
    const controller = arkServices['ark-controller'];
    const {stdout} = await execa(
      'helm',
      ['list', '-n', controller.namespace!, '-o', 'json'],
      {stdio: 'pipe'}
    );
    const releases = JSON.parse(stdout) as HelmRelease[];
    const arkController = releases.find(
      (r) => r.name === controller.helmReleaseName
    );
    return arkController?.app_version;
  } catch {
    return undefined;
  }
}

/**
 * Check if ARK is ready by verifying the ark-controller is running
 * @returns true if ark-controller deployment exists and has ready replicas
 */
export async function isArkReady(): Promise<boolean> {
  try {
    // Check if ark-controller deployment exists and get its status
    const result = await execa(
      'kubectl',
      ['get', 'deployment', 'ark-controller', '-n', 'ark-system', '-o', 'json'],
      {stdio: 'pipe'}
    );

    const deployment = JSON.parse(result.stdout);
    const readyReplicas = deployment.status?.readyReplicas || 0;
    const replicas = deployment.spec?.replicas || 0;

    // If main deployment has 0 replicas, check devspace deployment
    if (replicas === 0) {
      try {
        const devResult = await execa(
          'kubectl',
          [
            'get',
            'deployment',
            'ark-controller-devspace',
            '-n',
            'ark-system',
            '-o',
            'json',
          ],
          {stdio: 'pipe'}
        );

        const devDeployment = JSON.parse(devResult.stdout);
        const devReadyReplicas = devDeployment.status?.readyReplicas || 0;
        const devReplicas = devDeployment.spec?.replicas || 0;

        // ARK is ready if devspace deployment has ready replicas
        return devReadyReplicas > 0 && devReadyReplicas === devReplicas;
      } catch {
        // Devspace deployment doesn't exist
        return false;
      }
    }

    // ARK is ready if deployment exists and has at least one ready replica
    return readyReplicas > 0 && readyReplicas === replicas;
  } catch {
    // Main deployment doesn't exist, try devspace deployment
    try {
      const devResult = await execa(
        'kubectl',
        [
          'get',
          'deployment',
          'ark-controller-devspace',
          '-n',
          'ark-system',
          '-o',
          'json',
        ],
        {stdio: 'pipe'}
      );

      const devDeployment = JSON.parse(devResult.stdout);
      const devReadyReplicas = devDeployment.status?.readyReplicas || 0;
      const devReplicas = devDeployment.spec?.replicas || 0;

      // ARK is ready if devspace deployment has ready replicas
      return devReadyReplicas > 0 && devReadyReplicas === devReplicas;
    } catch {
      // Neither deployment exists or kubectl failed
      return false;
    }
  }
}
