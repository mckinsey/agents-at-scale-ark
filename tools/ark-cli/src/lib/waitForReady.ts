import {execa} from 'execa';
import type {ArkService} from '../types/arkService.js';

export interface WaitProgress {
  serviceName: string;
  ready: boolean;
  error?: string;
}

export async function waitForDeploymentReady(
  deploymentName: string,
  namespace: string,
  timeoutSeconds: number
): Promise<boolean> {
  try {
    await execa(
      'kubectl',
      [
        'wait',
        '--for=condition=available',
        `deployment/${deploymentName}`,
        '-n',
        namespace,
        `--timeout=${timeoutSeconds}s`,
      ],
      {timeout: timeoutSeconds * 1000}
    );
    return true;
  } catch {
    return false;
  }
}

export async function waitForServicesReady(
  services: ArkService[],
  timeoutSeconds: number,
  onProgress?: (progress: WaitProgress) => void
): Promise<boolean> {
  const validServices = services.filter(
    (s) => s.k8sDeploymentName && s.namespace
  );

  const checkPromises = validServices.map(async (service) => {
    const isReady = await waitForDeploymentReady(
      service.k8sDeploymentName!,
      service.namespace!,
      timeoutSeconds
    );

    if (onProgress) {
      onProgress({
        serviceName: service.name,
        ready: isReady,
      });
    }

    return isReady;
  });

  const results = await Promise.all(checkPromises);
  return results.every((ready) => ready);
}
