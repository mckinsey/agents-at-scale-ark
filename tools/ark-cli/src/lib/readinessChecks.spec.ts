import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const {execa} = await import('execa');
const {detectStorageBackend, runReadinessChecks} = await import(
  './readinessChecks.js'
);
const mockedExeca = execa as vi.MockedFunction<typeof execa>;

function kubectlOk(stdout = '') {
  return {exitCode: 0, stdout, stderr: ''} as any;
}

function kubectlFail(stderr = 'not found') {
  return {exitCode: 1, stdout: '', stderr} as any;
}

describe('detectStorageBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns etcd when the agents CRD exists', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlOk('agents.ark.mckinsey.com'));
    await expect(detectStorageBackend()).resolves.toBe('etcd');
  });

  it('returns postgresql when the agents CRD is absent', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlFail());
    await expect(detectStorageBackend()).resolves.toBe('postgresql');
  });
});

describe('runReadinessChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array on etcd without running further checks', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlOk());

    const results = await runReadinessChecks(60);

    expect(results).toEqual([]);
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('runs APIServices + API group checks on postgresql and returns both results', async () => {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'get' && args[1] === 'crd') {
        return Promise.resolve(kubectlFail());
      }
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com'));
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const results = await runReadinessChecks(120);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name)).toEqual([
      'APIServices available',
      'API group registered',
    ]);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('stops after APIServices failure and does not check API group', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlFail())
      .mockResolvedValueOnce(kubectlFail('timed out'))
      .mockResolvedValueOnce(kubectlOk());

    const results = await runReadinessChecks(60);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('APIServices available');
    expect(results[0].passed).toBe(false);
  });

  it('invokes the progress callback per check', async () => {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'get' && args[1] === 'crd') {
        return Promise.resolve(kubectlFail());
      }
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com'));
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const onProgress = vi.fn();
    await runReadinessChecks(60, onProgress);

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
