import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const {execa} = await import('execa');
const {detectStorageBackend, describeStorageBackend, runReadinessChecks} =
  await import('./readinessChecks.js');
const mockedExeca = execa as vi.MockedFunction<typeof execa>;

function kubectlOk(stdout = '') {
  return {exitCode: 0, stdout, stderr: ''} as any;
}

function kubectlFail(stderr = 'not found') {
  return {exitCode: 1, stdout: '', stderr} as any;
}

function kubectlNotFound() {
  return {
    exitCode: 1,
    stdout: '',
    stderr:
      'Error from server (NotFound): customresourcedefinitions.apiextensions.k8s.io "agents.ark.mckinsey.com" not found',
  } as any;
}

describe('detectStorageBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns etcd when the agents CRD exists', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlOk('agents.ark.mckinsey.com'));
    await expect(detectStorageBackend()).resolves.toBe('etcd');
  });

  it('returns postgresql when CRD absent and the aggregated APIService exists', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlNotFound())
      .mockResolvedValueOnce(kubectlOk('apiservice/v1alpha1.ark.mckinsey.com'));
    await expect(detectStorageBackend()).resolves.toBe('postgresql');
  });

  it('returns unknown when CRD absent and the aggregated APIService is missing', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlNotFound())
      .mockResolvedValueOnce(kubectlFail());
    await expect(detectStorageBackend()).resolves.toBe('unknown');
  });

  it('returns unknown after retrying a persistent connection failure, without probing the APIService', async () => {
    mockedExeca.mockResolvedValue(
      kubectlFail('The connection to the server localhost:8080 was refused')
    );
    await expect(detectStorageBackend()).resolves.toBe('unknown');
    expect(mockedExeca).toHaveBeenCalledTimes(3);
    expect(
      mockedExeca.mock.calls.every(
        (call: any) => call[1][0] === 'get' && call[1][1] === 'crd'
      )
    ).toBe(true);
  });

  it('recovers when a transient CRD failure succeeds on retry', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlFail('i/o timeout'))
      .mockResolvedValueOnce(kubectlOk('agents.ark.mckinsey.com'));
    await expect(detectStorageBackend()).resolves.toBe('etcd');
    expect(mockedExeca).toHaveBeenCalledTimes(2);
  });

  it('returns unknown when access is forbidden, without retrying', async () => {
    mockedExeca.mockResolvedValue(
      kubectlFail('Error from server (Forbidden): customresourcedefinitions is forbidden')
    );
    await expect(detectStorageBackend()).resolves.toBe('unknown');
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('returns unknown when stderr is empty or unrecognized', async () => {
    mockedExeca.mockResolvedValue(kubectlFail(''));
    await expect(detectStorageBackend()).resolves.toBe('unknown');
    expect(mockedExeca).toHaveBeenCalledTimes(3);
  });
});

describe('describeStorageBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports etcd when the agents CRD exists', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlOk('agents.ark.mckinsey.com'));
    await expect(describeStorageBackend()).resolves.toMatchObject({
      backend: 'etcd',
      status: 'etcd',
    });
  });

  it('reports postgresql when CRD absent and the aggregated APIService exists', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlNotFound())
      .mockResolvedValueOnce(kubectlOk('apiservice/v1alpha1.ark.mckinsey.com'));
    await expect(describeStorageBackend()).resolves.toMatchObject({
      backend: 'postgresql',
      status: 'postgresql',
    });
  });

  it('reports not-installed when neither CRD nor aggregated APIService exists', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlNotFound())
      .mockResolvedValueOnce(
        kubectlFail(
          'Error from server (NotFound): apiservices.apiregistration.k8s.io "v1alpha1.ark.mckinsey.com" not found'
        )
      );
    const result = await describeStorageBackend();
    expect(result.backend).toBe('unknown');
    expect(result.status).toBe('not-installed');
  });

  it('reports unreachable when the cluster cannot be contacted', async () => {
    mockedExeca.mockResolvedValue(
      kubectlFail('The connection to the server localhost:8080 was refused')
    );
    const result = await describeStorageBackend();
    expect(result.backend).toBe('unknown');
    expect(result.status).toBe('unreachable');
  });

  it('reports forbidden when access is denied', async () => {
    mockedExeca.mockResolvedValue(
      kubectlFail('Error from server (Forbidden): customresourcedefinitions is forbidden')
    );
    const result = await describeStorageBackend();
    expect(result.backend).toBe('unknown');
    expect(result.status).toBe('forbidden');
  });

  it('reports undetermined on an unrecognized error', async () => {
    mockedExeca.mockResolvedValue(kubectlFail('some unexpected kubectl error'));
    const result = await describeStorageBackend();
    expect(result.backend).toBe('unknown');
    expect(result.status).toBe('undetermined');
  });
});

describe('runReadinessChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array on etcd without running any checks', async () => {
    const results = await runReadinessChecks(60, 'etcd');

    expect(results).toEqual([]);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('runs APIServices + API group checks on postgresql and returns both results', async () => {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com'));
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const results = await runReadinessChecks(120, 'postgresql');

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual([
      'APIServices available',
      'API group registered',
    ]);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('stops after APIServices failure and does not check API group', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlFail('timed out'))
      .mockResolvedValueOnce(kubectlOk());

    const results = await runReadinessChecks(60, 'postgresql');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('APIServices available');
    expect(results[0].passed).toBe(false);
  });

  it('returns a single failed result when the backend is unknown, without probing', async () => {
    const results = await runReadinessChecks(60, 'unknown');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Storage backend');
    expect(results[0].passed).toBe(false);
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('invokes the progress callback per check', async () => {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com'));
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const onProgress = vi.fn();
    await runReadinessChecks(60, 'postgresql', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][0]).toMatchObject({
      name: 'APIServices available',
      passed: true,
    });
    expect(onProgress.mock.calls[1][0]).toMatchObject({
      name: 'API group registered',
      passed: true,
    });
  });
});
