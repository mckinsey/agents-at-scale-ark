import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const {execa} = await import('execa');
const {
  detectStorageBackend,
  describeStorageBackend,
  describeNamespaceMemory,
  runReadinessChecks,
} = await import('./readinessChecks.js');
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

describe('describeNamespaceMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function notFound(kind: string, name: string) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Error from server (NotFound): ${kind} "${name}" not found`,
    } as any;
  }

  function memoryJson(status: Record<string, unknown>) {
    return kubectlOk(JSON.stringify({status}));
  }

  function configMapList(enabledValues: string[]) {
    return kubectlOk(enabledValues.map((v) => `${v}\n`).join(''));
  }

  // kubectl is called in this order: the ArkConfig override, the Memory (the
  // overridden name first, when one applies), and only when no Memory is
  // usable, the broker ConfigMap listing followed by the broker Service.
  function respond(handlers: {
    arkconfig?: any;
    memories?: Record<string, any>;
    configmaps?: any;
    services?: any;
  }) {
    mockedExeca.mockImplementation(((_cmd: string, args: string[]) => {
      if (args[1] === 'arkconfig') {
        return Promise.resolve(handlers.arkconfig ?? kubectlOk(''));
      }
      if (args[1] === 'memory') {
        const name = args[2];
        return Promise.resolve(
          handlers.memories?.[name] ??
            notFound('memories.ark.mckinsey.com', name)
        );
      }
      if (args[1] === 'configmap') {
        return Promise.resolve(handlers.configmaps ?? configMapList([]));
      }
      if (args[1] === 'service') {
        return Promise.resolve(handlers.services ?? kubectlOk(''));
      }
      return Promise.resolve(kubectlFail('unexpected call'));
    }) as any);
  }

  function callsFor(resource: string) {
    return mockedExeca.mock.calls
      .map((call: any) => call[1] as string[])
      .filter((args) => args[1] === resource);
  }

  it('is ready when the memory carries a resolved address', async () => {
    respond({
      memories: {
        default: memoryJson({
          phase: 'ready',
          lastResolvedAddress: 'http://ark-broker.team-a.svc:8080',
        }),
      },
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('ready');
    expect(result.memoryName).toBe('default');
    expect(result.message).toBe('http://ark-broker.team-a.svc:8080');
  });

  it('scopes the memory read to the namespace it was asked about', async () => {
    respond({
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await describeNamespaceMemory('team-a');

    expect(callsFor('memory')[0]).toEqual([
      'get',
      'memory',
      'default',
      '--namespace',
      'team-a',
      '-o',
      'json',
    ]);
  });

  it('reads the ArkConfig singleton cluster-scoped, by jsonpath', async () => {
    respond({
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await describeNamespaceMemory('team-a');

    expect(callsFor('arkconfig')[0]).toEqual([
      'get',
      'arkconfig',
      'default',
      '-o',
      'jsonpath={.spec.defaultMemory.name}',
    ]);
  });

  it('does not list the broker ConfigMaps when a memory is usable', async () => {
    respond({
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await describeNamespaceMemory('team-a');

    expect(callsFor('configmap')).toHaveLength(0);
  });

  it('is unresolved when the memory exists but never resolved an address', async () => {
    respond({
      memories: {
        default: memoryJson({
          phase: 'error',
          message: 'service ark-broker not found',
        }),
      },
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('unresolved');
    expect(result.message).toContain('service ark-broker not found');
  });

  it('is unresolved when lastResolvedAddress is present but empty', async () => {
    respond({
      memories: {
        default: memoryJson({phase: 'running', lastResolvedAddress: ''}),
      },
    });

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'unresolved',
    });
  });

  it('is missing when an enabled broker ConfigMap exists but no memory does', async () => {
    respond({configmaps: configMapList(['true'])});

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('missing');
    expect(result.message).toContain('team-a');
  });

  it('scopes the broker ConfigMap listing to the namespace, over both names', async () => {
    respond({configmaps: configMapList(['true'])});

    await describeNamespaceMemory('team-a');

    expect(callsFor('configmap')[0]).toEqual([
      'get',
      'configmap',
      'ark-config-broker',
      'ark-config-streaming',
      '--namespace',
      'team-a',
      '--ignore-not-found',
      '-o',
      'jsonpath={range .items[*]}{.data.enabled}{"\\n"}{end}',
    ]);
  });

  it('does not count a broker ConfigMap that is present but disabled', async () => {
    respond({configmaps: configMapList(['false'])});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'no-broker',
    });
  });

  it('counts a broker when only one of the two ConfigMaps is enabled', async () => {
    respond({configmaps: configMapList(['false', 'true'])});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'missing',
    });
  });

  // The telemetry ConfigMaps are independently disablable, so their absence is
  // not proof there is no broker. Claiming otherwise was a confident false
  // statement about a namespace that has one.
  it('finds a broker from its Service when both ConfigMaps are disabled', async () => {
    respond({
      configmaps: configMapList(['false']),
      services: kubectlOk('service/ark-broker'),
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('missing');
    expect(result.message).toContain('has a broker');
  });

  it('finds a broker from its Service when no ConfigMap exists at all', async () => {
    respond({services: kubectlOk('service/ark-broker')});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'missing',
    });
  });

  it('does not probe for the Service once a ConfigMap has answered', async () => {
    respond({configmaps: configMapList(['true'])});

    await describeNamespaceMemory('team-a');

    expect(callsFor('service')).toHaveLength(0);
  });

  it('scopes the broker Service probe to the namespace, by chart label', async () => {
    respond({services: kubectlOk('service/ark-broker')});

    await describeNamespaceMemory('team-a');

    expect(callsFor('service')[0]).toEqual([
      'get',
      'service',
      '--namespace',
      'team-a',
      '--selector',
      'app.kubernetes.io/name=ark-broker',
      '-o',
      'name',
    ]);
  });

  it('is undetermined when the Service probe cannot answer either', async () => {
    respond({services: kubectlFail('services is forbidden')});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'undetermined',
    });
  });

  it('is no-broker when neither a memory nor an enabled ConfigMap exists', async () => {
    respond({configmaps: configMapList([])});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'no-broker',
    });
  });

  it('uses the ArkConfig name when the Memory it names resolves', async () => {
    respond({
      arkconfig: kubectlOk('shared-history'),
      memories: {
        'shared-history': memoryJson({
          lastResolvedAddress: 'http://shared:8080',
        }),
      },
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('ready');
    expect(result.memoryName).toBe('shared-history');
    expect(result.message).toBe('http://shared:8080');
  });

  // The admission webhook only injects the ArkConfig name when that Memory
  // exists and resolves, so an absent or unresolved one leaves the namespace
  // running on Memory/default. Judging the override alone reported a healthy
  // namespace as broken.
  it('falls back to Memory/default when the ArkConfig name is absent', async () => {
    respond({
      arkconfig: kubectlOk('shared-history'),
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('ready');
    expect(result.memoryName).toBe('default');
  });

  it('falls back to Memory/default when the ArkConfig name never resolved', async () => {
    respond({
      arkconfig: kubectlOk('shared-history'),
      memories: {
        'shared-history': memoryJson({phase: 'error'}),
        default: memoryJson({lastResolvedAddress: 'http://b:80'}),
      },
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('ready');
    expect(result.memoryName).toBe('default');
  });

  it('probes only once when ArkConfig names the fallback memory itself', async () => {
    respond({
      arkconfig: kubectlOk('default'),
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await describeNamespaceMemory('team-a');

    expect(callsFor('memory')).toHaveLength(1);
  });

  it('treats an absent ArkConfig as no override', async () => {
    respond({
      arkconfig: notFound('arkconfigs.ark.mckinsey.com', 'default'),
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.memoryName).toBe('default');
    expect(result.status).toBe('ready');
  });

  // The aggregated API server serves no arkconfigs, and kubectl words that
  // differently from a missing object. Reading it as "could not tell" made
  // every broken namespace on the postgresql backend report undetermined.
  it('treats an ArkConfig the cluster does not serve as no override', async () => {
    respond({
      arkconfig: kubectlFail(
        'error: the server doesn\'t have a resource type "arkconfig"'
      ),
      configmaps: configMapList(['true']),
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('missing');
    expect(result.message).not.toContain('ArkConfig');
  });

  it('does not retry an ArkConfig the cluster does not serve', async () => {
    respond({
      arkconfig: kubectlFail(
        'error: the server doesn\'t have a resource type "arkconfig"'
      ),
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await describeNamespaceMemory('team-a');

    expect(callsFor('arkconfig')).toHaveLength(1);
  });

  // A namespace-scoped user cannot read the cluster-scoped ArkConfig, so the
  // fallback verdict may be judging the wrong name. A healthy answer still
  // stands; an accusation does not.
  it('keeps a healthy verdict when ArkConfig cannot be read', async () => {
    respond({
      arkconfig: kubectlFail('arkconfigs.ark.mckinsey.com is forbidden'),
      memories: {default: memoryJson({lastResolvedAddress: 'http://b:80'})},
    });

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'ready',
    });
  });

  it('downgrades a missing verdict to undetermined when ArkConfig cannot be read', async () => {
    respond({
      arkconfig: kubectlFail('arkconfigs.ark.mckinsey.com is forbidden'),
      configmaps: configMapList(['true']),
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('undetermined');
    expect(result.message).toContain('ArkConfig could not be read');
  });

  it('downgrades an unresolved verdict to undetermined when ArkConfig cannot be read', async () => {
    respond({
      arkconfig: kubectlFail('arkconfigs.ark.mckinsey.com is forbidden'),
      memories: {default: memoryJson({phase: 'error'})},
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('undetermined');
    expect(result.message).toContain('ArkConfig could not be read');
  });

  // The fall-through verdict must name the Memory the executor will actually
  // look for, not the one ArkConfig asked for and did not get.
  it('names the fallback memory when neither the override nor default exists', async () => {
    respond({
      arkconfig: kubectlOk('shared-history'),
      configmaps: configMapList(['true']),
    });

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('missing');
    expect(result.memoryName).toBe('default');
    expect(result.message).toContain('"default"');
    expect(result.message).toContain('ArkConfig names "shared-history"');
  });

  it('is undetermined when reading the memory is forbidden', async () => {
    respond({
      memories: {
        default: kubectlFail('memories.ark.mckinsey.com is forbidden'),
      },
    });

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'undetermined',
    });
  });

  it('is undetermined when the namespace itself does not exist', async () => {
    respond({memories: {default: notFound('namespaces', 'team-a')}});

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('undetermined');
    expect(result.message).toContain('does not exist');
  });

  it('is undetermined when the memory payload is not JSON', async () => {
    respond({memories: {default: kubectlOk('not json')}});

    await expect(describeNamespaceMemory('team-a')).resolves.toMatchObject({
      status: 'undetermined',
    });
  });

  // Failing closed to "no broker" would have printed a reassuring line drawn
  // from no evidence at all.
  it('is undetermined when the broker ConfigMap listing fails', async () => {
    respond({configmaps: kubectlFail('configmaps is forbidden')});

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('undetermined');
    expect(result.message).toContain('has a broker');
  });

  // The message used to blame the ConfigMap listing even when it was the
  // Service probe that could not answer.
  it('does not blame the ConfigMap probe for a Service probe failure', async () => {
    respond({services: kubectlFail('services is forbidden')});

    const result = await describeNamespaceMemory('team-a');

    expect(result.status).toBe('undetermined');
    expect(result.message).not.toContain('ConfigMap');
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
