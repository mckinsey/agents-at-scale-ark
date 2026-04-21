import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

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

  it('returns an empty array on etcd without running layers 2-5', async () => {
    mockedExeca.mockResolvedValueOnce(kubectlOk());

    const results = await runReadinessChecks(60);

    expect(results).toEqual([]);
    expect(mockedExeca).toHaveBeenCalledTimes(1);
  });

  it('stops at the first failing layer and reports it', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlFail())
      .mockResolvedValueOnce(kubectlFail('timed out'))
      .mockResolvedValueOnce(kubectlOk());

    const results = await runReadinessChecks(60);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('APIServices available');
    expect(results[0].passed).toBe(false);
  });

  it('invokes the progress callback for each result', async () => {
    mockedExeca
      .mockResolvedValueOnce(kubectlFail())
      .mockResolvedValueOnce(kubectlFail('timed out'))
      .mockResolvedValueOnce(kubectlOk());

    const onProgress = vi.fn();
    await runReadinessChecks(60, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0][0]).toMatchObject({
      name: 'APIServices available',
      passed: false,
    });
  });
});

describe('runReadinessChecks full postgresql flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs all 4 layers successfully and returns 4 passing results', async () => {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'get' && args[1] === 'crd') {
        return Promise.resolve(kubectlFail());
      }
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com\nmodels.ark.mckinsey.com'));
      }
      if (args[0] === 'get' && args[1]?.startsWith('model')) {
        return Promise.resolve(
          kubectlOk('[{"type":"Ready","status":"True"}]')
        );
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const promise = runReadinessChecks(300);

    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(4);
    expect(results.map((r) => r.name)).toEqual([
      'APIServices available',
      'API group registered',
      'Aggregated API stable',
      'Controllers reconciling',
    ]);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('resets the stable counter when a probe fails transiently', async () => {
    let aggregatedCallIndex = 0;
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[0] === 'get' && args[1] === 'crd') {
        return Promise.resolve(kubectlFail());
      }
      if (args[0] === 'wait' && args[2] === 'apiservice') {
        return Promise.resolve(kubectlOk());
      }
      if (args[0] === 'api-resources') {
        return Promise.resolve(kubectlOk('agents.ark.mckinsey.com'));
      }
      if (
        args[0] === 'get' &&
        typeof args[1] === 'string' &&
        args[1].endsWith('ark.mckinsey.com')
      ) {
        aggregatedCallIndex += 1;
        if (aggregatedCallIndex === 7) {
          return Promise.resolve(kubectlFail('transient'));
        }
        return Promise.resolve(kubectlOk());
      }
      if (args[0] === 'get' && args[1] === 'model') {
        return Promise.resolve(
          kubectlOk('[{"type":"Ready","status":"True"}]')
        );
      }
      return Promise.resolve(kubectlOk());
    }) as any);

    const promise = runReadinessChecks(600);
    await vi.runAllTimersAsync();
    const results = await promise;

    const stable = results.find((r) => r.name === 'Aggregated API stable');
    expect(stable?.passed).toBe(true);
    expect(stable?.message).toMatch(/10 consecutive probes/);
  });
});
