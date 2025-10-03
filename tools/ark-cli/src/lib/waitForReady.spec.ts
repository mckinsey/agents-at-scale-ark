import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import type {ArkService} from '../types/arkService.js';

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn(),
}));

const {execa} = await import('execa');
const {waitForDeploymentReady, waitForServicesReady} = await import(
  './waitForReady.js'
);
const mockedExeca = execa as jest.MockedFunction<typeof execa>;

describe('waitForDeploymentReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when deployment is ready', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'deployment.apps/ark-controller condition met',
      stderr: '',
      exitCode: 0,
    } as any);

    const result = await waitForDeploymentReady(
      'ark-controller',
      'ark-system',
      30
    );

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

  it('returns false on error', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('kubectl error'));

    const result = await waitForDeploymentReady('ark-api', 'default', 10);

    expect(result).toBe(false);
  });
});

describe('waitForServicesReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const service1: ArkService = {
    name: 'ark-controller',
    helmReleaseName: 'ark-controller',
    description: 'Core controller',
    enabled: true,
    category: 'core',
    namespace: 'ark-system',
    k8sDeploymentName: 'ark-controller',
  };

  const service2: ArkService = {
    name: 'ark-api',
    helmReleaseName: 'ark-api',
    description: 'API service',
    enabled: true,
    category: 'service',
    namespace: 'default',
    k8sDeploymentName: 'ark-api',
  };

  it('returns true when all services are ready', async () => {
    mockedExeca.mockResolvedValue({
      stdout: 'condition met',
      stderr: '',
      exitCode: 0,
    } as any);

    const result = await waitForServicesReady([service1, service2], 30);

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledTimes(2);
  });

  it('returns false when any service fails', async () => {
    mockedExeca
      .mockResolvedValueOnce({stdout: 'ok', stderr: '', exitCode: 0} as any)
      .mockRejectedValueOnce(new Error('timeout'));

    const result = await waitForServicesReady([service1, service2], 30);

    expect(result).toBe(false);
  });

  it('calls progress callback', async () => {
    mockedExeca.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    } as any);

    const onProgress = jest.fn();
    await waitForServicesReady([service1], 30, onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      serviceName: 'ark-controller',
      ready: true,
    });
  });

  it('skips services without deployment info', async () => {
    const incompleteService: ArkService = {
      name: 'incomplete',
      helmReleaseName: 'incomplete',
      description: 'No deployment info',
      enabled: true,
      category: 'service',
    };

    mockedExeca.mockResolvedValue({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
    } as any);

    const result = await waitForServicesReady(
      [service1, incompleteService],
      30
    );

    expect(result).toBe(true);
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });
});
