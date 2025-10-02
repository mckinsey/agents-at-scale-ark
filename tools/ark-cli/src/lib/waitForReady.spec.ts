import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import type {ArkService} from '../types/arkService.js';

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

const {execa} = await import('execa');
const {waitForDeploymentReady, waitForServicesReady} = await import('./waitForReady.js');
const mockedExeca = execa as jest.MockedFunction<typeof execa>;

describe('waitForDeploymentReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when deployment becomes available', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'deployment.apps/ark-controller condition met',
      stderr: '',
      exitCode: 0,
      command: 'kubectl wait',
      escapedCommand: 'kubectl wait',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
    } as any);

    const result = await waitForDeploymentReady('ark-controller', 'ark-system', 30);

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith(
      'kubectl',
      [
        'wait',
        '--for=condition=available',
        'deployment/ark-controller',
        '-n',
        'ark-system',
        '--timeout=30s',
      ],
      {timeout: 30000}
    );
  });

  it('should return false when deployment times out', async () => {
    mockedExeca.mockRejectedValueOnce(
      new Error('error: timed out waiting for the condition on deployments/ark-api')
    );

    const result = await waitForDeploymentReady('ark-api', 'default', 10);

    expect(result).toBe(false);
  });

  it('should return false when deployment does not exist', async () => {
    mockedExeca.mockRejectedValueOnce(
      new Error('error: no matching resources found')
    );

    const result = await waitForDeploymentReady('nonexistent', 'default', 5);

    expect(result).toBe(false);
  });

  it('should return false when namespace does not exist', async () => {
    mockedExeca.mockRejectedValueOnce(
      new Error('Error from server (NotFound): namespaces "bad-namespace" not found')
    );

    const result = await waitForDeploymentReady('ark-api', 'bad-namespace', 5);

    expect(result).toBe(false);
  });
});

describe('waitForServicesReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when all services become ready', async () => {
    const services: ArkService[] = [
      {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        description: 'Core controller',
        enabled: true,
        category: 'core',
        namespace: 'ark-system',
        k8sDeploymentName: 'ark-controller',
      },
      {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        description: 'API service',
        enabled: true,
        category: 'service',
        namespace: 'default',
        k8sDeploymentName: 'ark-api',
      },
    ];

    mockedExeca
      .mockResolvedValueOnce({
        stdout: 'deployment.apps/ark-controller condition met',
        stderr: '',
        exitCode: 0,
      } as any)
      .mockResolvedValueOnce({
        stdout: 'deployment.apps/ark-api condition met',
        stderr: '',
        exitCode: 0,
      } as any);

    const result = await waitForServicesReady(services, 30);

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledTimes(2);
  });

  it('should call onProgress callback for each service check', async () => {
    const services: ArkService[] = [
      {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        description: 'Core controller',
        enabled: true,
        category: 'core',
        namespace: 'ark-system',
        k8sDeploymentName: 'ark-controller',
      },
    ];

    mockedExeca.mockResolvedValueOnce({
      stdout: 'deployment.apps/ark-controller condition met',
      stderr: '',
      exitCode: 0,
    } as any);

    const onProgress = jest.fn();
    await waitForServicesReady(services, 30, onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      serviceName: 'ark-controller',
      ready: true,
    });
  });

  it('should return false when timeout is reached', async () => {
    const services: ArkService[] = [
      {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        description: 'API service',
        enabled: true,
        category: 'service',
        namespace: 'default',
        k8sDeploymentName: 'ark-api',
      },
    ];

    mockedExeca.mockRejectedValue(
      new Error('error: timed out waiting for the condition on deployments/ark-api')
    );

    const result = await waitForServicesReady(services, 1);

    expect(result).toBe(false);
  });

  it('should skip services without deployment name or namespace', async () => {
    const services: ArkService[] = [
      {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        description: 'Core controller',
        enabled: true,
        category: 'core',
        namespace: 'ark-system',
        k8sDeploymentName: 'ark-controller',
      },
      {
        name: 'incomplete-service',
        helmReleaseName: 'incomplete-service',
        description: 'Service without deployment info',
        enabled: true,
        category: 'service',
      },
    ];

    mockedExeca.mockResolvedValueOnce({
      stdout: 'deployment.apps/ark-controller condition met',
      stderr: '',
      exitCode: 0,
    } as any);

    const result = await waitForServicesReady(services, 30);

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('should handle partial success correctly', async () => {
    const services: ArkService[] = [
      {
        name: 'ark-controller',
        helmReleaseName: 'ark-controller',
        description: 'Core controller',
        enabled: true,
        category: 'core',
        namespace: 'ark-system',
        k8sDeploymentName: 'ark-controller',
      },
      {
        name: 'ark-api',
        helmReleaseName: 'ark-api',
        description: 'API service',
        enabled: true,
        category: 'service',
        namespace: 'default',
        k8sDeploymentName: 'ark-api',
      },
    ];

    mockedExeca
      .mockResolvedValueOnce({
        stdout: 'deployment.apps/ark-controller condition met',
        stderr: '',
        exitCode: 0,
      } as any)
      .mockRejectedValueOnce(
        new Error('error: timed out waiting for the condition on deployments/ark-api')
      );

    const onProgress = jest.fn();
    const result = await waitForServicesReady(services, 1, onProgress);

    expect(result).toBe(false);
    expect(onProgress).toHaveBeenCalledWith({
      serviceName: 'ark-controller',
      ready: true,
    });
    expect(onProgress).toHaveBeenCalledWith({
      serviceName: 'ark-api',
      ready: false,
    });
  });
});
