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
  } catch (error) {
    return false;
  }
}

export async function waitForServicesReady(
  services: ArkService[],
  timeoutSeconds: number,
  onProgress?: (progress: WaitProgress) => void
): Promise<boolean> {
  const startTime = Date.now();
  const endTime = startTime + timeoutSeconds * 1000;
  const checkInterval = 5000;

  const serviceStatus = new Map<string, boolean>();
  services.forEach((s) => serviceStatus.set(s.name, false));

  while (Date.now() < endTime) {
    let allReady = true;

    for (const service of services) {
      if (serviceStatus.get(service.name)) {
        continue;
      }

      if (!service.k8sDeploymentName || !service.namespace) {
        continue;
      }

      const remainingTime = Math.floor((endTime - Date.now()) / 1000);
      if (remainingTime <= 0) {
        allReady = false;
        break;
      }

      const isReady = await waitForDeploymentReady(
        service.k8sDeploymentName,
        service.namespace,
        Math.min(checkInterval / 1000, remainingTime)
      );

      serviceStatus.set(service.name, isReady);

      if (onProgress) {
        onProgress({
          serviceName: service.name,
          ready: isReady,
        });
      }

      if (!isReady) {
        allReady = false;
      }
    }

    if (allReady) {
      return true;
    }

    const remainingTime = endTime - Date.now();
    if (remainingTime > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(checkInterval, remainingTime))
      );
    }
  }

  return false;
}
