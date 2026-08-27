import {execa} from 'execa';

export type StorageBackend = 'etcd' | 'postgresql';

export type DetectedBackend = StorageBackend | 'unknown';

export type BackendStatus =
  | 'etcd'
  | 'postgresql'
  | 'not-installed'
  | 'unreachable'
  | 'forbidden'
  | 'undetermined';

export interface BackendDetection {
  backend: DetectedBackend;
  status: BackendStatus;
  message: string;
}

export interface ReadinessCheckResult {
  name: string;
  passed: boolean;
  durationMs: number;
  message?: string;
}

export type NamespaceMemoryStatus =
  | 'ready'
  | 'unresolved'
  | 'missing'
  | 'no-broker'
  | 'undetermined';

export interface NamespaceMemoryCheck {
  status: NamespaceMemoryStatus;
  namespace: string;
  memoryName: string;
  message: string;
}

export type ReadinessProgress = (result: ReadinessCheckResult) => void;

const API_GROUP_POLL_INTERVAL_MS = 10000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runKubectl(
  args: string[],
  timeoutMs: number
): Promise<{exitCode: number; stdout: string; stderr: string}> {
  const result = await execa('kubectl', args, {
    timeout: timeoutMs,
    reject: false,
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

type FailureReason = 'not-found' | 'forbidden' | 'unreachable' | 'undetermined';

// A resource type the cluster does not serve at all. kubectl reports this
// differently from a missing object, and it is just as final an answer — the
// aggregated API server serves no arkconfigs, so this is the normal reply
// there rather than something to retry.
const UNSERVED_RESOURCE_PATTERN =
  /doesn't have a resource type|no matches for kind|the server could not find the requested resource/i;

function classifyFailure(stderr: string): FailureReason {
  if (/not\s*found/i.test(stderr) || UNSERVED_RESOURCE_PATTERN.test(stderr)) {
    return 'not-found';
  }
  if (/forbidden|unauthorized/i.test(stderr)) {
    return 'forbidden';
  }
  if (
    /connection refused|was refused|no such host|i\/o timeout|timed out|dial tcp|unable to connect|did you specify the right host/i.test(
      stderr
    )
  ) {
    return 'unreachable';
  }
  return 'undetermined';
}

const DETECT_RETRY_DELAY_MS = 250;
const DETECT_MAX_RETRIES = 2;

function isAuthoritativeResult(result: {
  exitCode: number;
  stderr: string;
}): boolean {
  if (result.exitCode === 0) {
    return true;
  }
  return (
    /not\s*found|forbidden/i.test(result.stderr) ||
    UNSERVED_RESOURCE_PATTERN.test(result.stderr)
  );
}

async function probeKubectl(
  args: string[],
  timeoutMs: number,
  maxRetries = DETECT_MAX_RETRIES
): Promise<{exitCode: number; stdout: string; stderr: string}> {
  let result = await runKubectl(args, timeoutMs);
  for (
    let attempt = 0;
    attempt < maxRetries && !isAuthoritativeResult(result);
    attempt++
  ) {
    await sleep(DETECT_RETRY_DELAY_MS);
    result = await runKubectl(args, timeoutMs);
  }
  return result;
}

function unknownFrom(
  reason: Exclude<FailureReason, 'not-found'>
): BackendDetection {
  switch (reason) {
    case 'forbidden':
      return {
        backend: 'unknown',
        status: 'forbidden',
        message:
          'Access denied reading cluster resources (RBAC) — cannot determine the storage backend.',
      };
    case 'unreachable':
      return {
        backend: 'unknown',
        status: 'unreachable',
        message:
          'Cluster is not reachable (connection failed or timed out) — cannot determine the storage backend.',
      };
    default:
      return {
        backend: 'unknown',
        status: 'undetermined',
        message:
          'Could not determine the storage backend (unrecognized kubectl error).',
      };
  }
}

export async function describeStorageBackend(): Promise<BackendDetection> {
  const crd = await probeKubectl(
    ['get', 'crd', 'agents.ark.mckinsey.com'],
    10000
  );
  if (crd.exitCode === 0) {
    return {
      backend: 'etcd',
      status: 'etcd',
      message:
        'ARK is running the etcd (Kubernetes-native) backend; agents are stored as CRDs.',
    };
  }
  const crdReason = classifyFailure(crd.stderr);
  if (crdReason !== 'not-found') {
    return unknownFrom(crdReason);
  }

  const api = await probeKubectl(
    ['get', 'apiservice', 'v1alpha1.ark.mckinsey.com', '-o', 'name'],
    10000
  );
  if (api.exitCode === 0) {
    return {
      backend: 'postgresql',
      status: 'postgresql',
      message:
        'ARK is running the PostgreSQL backend; agents are served by the aggregated API server.',
    };
  }
  const apiReason = classifyFailure(api.stderr);
  if (apiReason === 'not-found') {
    return {
      backend: 'unknown',
      status: 'not-installed',
      message:
        'ARK is not installed on this cluster (no agents CRD and no aggregated APIService).',
    };
  }
  return unknownFrom(apiReason);
}

// The Memory name the broker chart creates, and the one NewMemoryForQuery
// hardcodes when a Query carries no spec.memory. ArkConfig can name a
// different one, but only as a candidate — see describeNamespaceMemory.
const FALLBACK_MEMORY_NAME = 'default';

// Either ConfigMap is a broker presence signal, and only when its data carries
// enabled: "true" — the same test BrokerServiceRefFor applies before the
// controller's default-Memory backstop will act on it.
const BROKER_CONFIGMAP_NAMES = ['ark-config-broker', 'ark-config-streaming'];

// The ConfigMaps are not the whole story: they are rendered only when
// otelEndpoint.enabled / streaming.enabled are set, both of which default true
// but are independently disablable. A broker installed purely for message and
// session storage has neither, and reporting "no broker in this namespace"
// there is a confident claim that happens to be false. The label is the
// chart's rather than the release's, so a renamed release still matches. This
// mirrors DefaultMemoryReconciler's own two-signal lookup.
const BROKER_SERVICE_SELECTOR = 'app.kubernetes.io/name=ark-broker';

const BROKER_ENABLED_JSONPATH = '{range .items[*]}{.data.enabled}{"\\n"}{end}';

type MemoryProbe =
  | {outcome: 'resolved'; address: string}
  | {outcome: 'unresolved'; detail: string}
  | {outcome: 'absent'}
  | {outcome: 'undetermined'; detail: string};

type BrokerProbe = 'present' | 'absent' | 'undetermined';

type MemoryOverride =
  | {kind: 'name'; name: string}
  | {kind: 'none'}
  | {kind: 'undetermined'};

// kubectl reports a missing namespace and a missing object with the same
// NotFound status, so the two are told apart by the message. Reporting on a
// namespace that does not exist as "no broker here" would be a confident
// answer drawn from nothing.
function isMissingNamespace(stderr: string): boolean {
  return /namespaces?\s+"[^"]*"\s+not\s+found/i.test(stderr);
}

async function probeMemory(
  namespace: string,
  name: string
): Promise<MemoryProbe> {
  const result = await probeKubectl(
    ['get', 'memory', name, '--namespace', namespace, '-o', 'json'],
    10000
  );

  if (result.exitCode !== 0) {
    if (isMissingNamespace(result.stderr)) {
      return {
        outcome: 'undetermined',
        detail: `namespace ${namespace} does not exist`,
      };
    }
    const reason = classifyFailure(result.stderr);
    if (reason === 'not-found') {
      return {outcome: 'absent'};
    }
    return {outcome: 'undetermined', detail: reason};
  }

  let address = '';
  let phase = '';
  let statusMessage = '';
  try {
    const parsed = JSON.parse(result.stdout);
    address = parsed?.status?.lastResolvedAddress || '';
    phase = parsed?.status?.phase || '';
    statusMessage = parsed?.status?.message || '';
  } catch {
    return {outcome: 'undetermined', detail: 'unreadable kubectl output'};
  }

  if (address) {
    return {outcome: 'resolved', address};
  }
  return {
    outcome: 'unresolved',
    detail: statusMessage || phase || 'no resolved address',
  };
}

async function probeBrokerConfigMaps(namespace: string): Promise<BrokerProbe> {
  const result = await probeKubectl(
    [
      'get',
      'configmap',
      ...BROKER_CONFIGMAP_NAMES,
      '--namespace',
      namespace,
      '--ignore-not-found',
      '-o',
      `jsonpath=${BROKER_ENABLED_JSONPATH}`,
    ],
    10000
  );
  if (result.exitCode !== 0) {
    return 'undetermined';
  }
  const enabled = result.stdout
    .split('\n')
    .some((line) => line.trim() === 'true');
  return enabled ? 'present' : 'absent';
}

async function probeBrokerService(namespace: string): Promise<BrokerProbe> {
  const result = await probeKubectl(
    [
      'get',
      'service',
      '--namespace',
      namespace,
      '--selector',
      BROKER_SERVICE_SELECTOR,
      '-o',
      'name',
    ],
    10000
  );
  if (result.exitCode !== 0) {
    return 'undetermined';
  }
  return result.stdout.trim() ? 'present' : 'absent';
}

async function probeBroker(namespace: string): Promise<BrokerProbe> {
  const fromConfigMaps = await probeBrokerConfigMaps(namespace);
  if (fromConfigMaps === 'present') {
    return fromConfigMaps;
  }
  const fromService = await probeBrokerService(namespace);
  if (fromService === 'present') {
    return fromService;
  }
  // Neither signal found it. Say so only if both probes actually answered.
  if (fromConfigMaps === 'undetermined' || fromService === 'undetermined') {
    return 'undetermined';
  }
  return 'absent';
}

// ArkConfig is cluster-scoped and optional, and the aggregated API server does
// not serve it at all — both of which classifyFailure reports as not-found, a
// legitimate "there is no override". "Could not tell" is different: a
// namespace-scoped user is forbidden from reading a cluster-scoped resource,
// and would otherwise be judged against the wrong name.
async function readDefaultMemoryOverride(): Promise<MemoryOverride> {
  const result = await probeKubectl(
    [
      'get',
      'arkconfig',
      'default',
      '-o',
      'jsonpath={.spec.defaultMemory.name}',
    ],
    10000
  );
  if (result.exitCode === 0) {
    const name = result.stdout.trim();
    return name ? {kind: 'name', name} : {kind: 'none'};
  }
  if (classifyFailure(result.stderr) === 'not-found') {
    return {kind: 'none'};
  }
  return {kind: 'undetermined'};
}

/**
 * Report whether the namespace ends up with a Memory the executor can use.
 *
 * Existence is not the question: NewHTTPMemory errors when
 * status.lastResolvedAddress is empty, so a Memory left unresolved by a
 * missing broker Service fails every query in the namespace rather than
 * degrading. A namespace with no broker is expected to have no Memory, so that
 * is reported as unconfigured rather than broken.
 *
 * ArkConfig.defaultMemory only changes the answer when the Memory it names
 * both exists and resolves: resolveInjectableMemory declines to inject
 * otherwise, and NewMemoryForQuery then falls back to the hardcoded name
 * `default`. So the override is a candidate, and `default` decides the verdict
 * whenever that candidate is not usable.
 */
export async function describeNamespaceMemory(
  namespace: string
): Promise<NamespaceMemoryCheck> {
  const override = await readDefaultMemoryOverride();

  if (override.kind === 'name' && override.name !== FALLBACK_MEMORY_NAME) {
    const probe = await probeMemory(namespace, override.name);
    if (probe.outcome === 'resolved') {
      return {
        namespace,
        memoryName: override.name,
        status: 'ready',
        message: probe.address,
      };
    }
    if (probe.outcome === 'undetermined') {
      return {
        namespace,
        memoryName: override.name,
        status: 'undetermined',
        message: `Could not read Memory "${override.name}" in namespace ${namespace} (${probe.detail}).`,
      };
    }
  }

  const unusedOverride =
    override.kind === 'name' && override.name !== FALLBACK_MEMORY_NAME
      ? override.name
      : undefined;
  const check = await describeFallbackMemory(namespace, unusedOverride);

  // The override read failed, so this verdict may be judging the wrong name.
  // Only downgrade one that accuses the namespace of being broken.
  if (
    override.kind === 'undetermined' &&
    (check.status === 'missing' || check.status === 'unresolved')
  ) {
    return {
      ...check,
      status: 'undetermined',
      message: `${check.message} ArkConfig could not be read, so a cluster-wide default memory name may apply instead.`,
    };
  }
  return check;
}

async function describeFallbackMemory(
  namespace: string,
  unusedOverride?: string
): Promise<NamespaceMemoryCheck> {
  const base = {namespace, memoryName: FALLBACK_MEMORY_NAME};
  // The operator asked for a different name and is not getting it. Without
  // saying so, the remediation below reads as "create Memory/default", which
  // is right for the executor and confusing next to their own ArkConfig.
  const overrideNote = unusedOverride
    ? ` ArkConfig names "${unusedOverride}", which is not usable here, so resolution falls back to "${FALLBACK_MEMORY_NAME}".`
    : '';
  const probe = await probeMemory(namespace, FALLBACK_MEMORY_NAME);

  if (probe.outcome === 'resolved') {
    return {...base, status: 'ready', message: probe.address};
  }
  if (probe.outcome === 'undetermined') {
    return {
      ...base,
      status: 'undetermined',
      message: `Could not read Memory "${FALLBACK_MEMORY_NAME}" in namespace ${namespace} (${probe.detail}).`,
    };
  }
  if (probe.outcome === 'unresolved') {
    return {
      ...base,
      status: 'unresolved',
      message: `Memory "${FALLBACK_MEMORY_NAME}" in namespace ${namespace} has not resolved an address (${probe.detail}); queries using it will fail.${overrideNote}`,
    };
  }

  const broker = await probeBroker(namespace);
  if (broker === 'undetermined') {
    return {
      ...base,
      status: 'undetermined',
      message: `Could not determine whether namespace ${namespace} has a broker, so a missing Memory cannot be judged.`,
    };
  }
  if (broker === 'present') {
    return {
      ...base,
      status: 'missing',
      message: `Namespace ${namespace} has a broker but no Memory "${FALLBACK_MEMORY_NAME}"; chats there will silently lose conversation history.${overrideNote}`,
    };
  }
  return {
    ...base,
    status: 'no-broker',
    message: `No broker in namespace ${namespace}, so no conversation history is kept there.`,
  };
}

export async function detectStorageBackend(): Promise<DetectedBackend> {
  return (await describeStorageBackend()).backend;
}

async function waitForApiServices(
  timeoutSeconds: number
): Promise<ReadinessCheckResult> {
  const start = Date.now();
  const primary = await runKubectl(
    [
      'wait',
      '--for=condition=Available',
      'apiservice',
      'v1alpha1.ark.mckinsey.com',
      `--timeout=${timeoutSeconds}s`,
    ],
    timeoutSeconds * 1000 + 5000
  );
  await runKubectl(
    [
      'wait',
      '--for=condition=Available',
      'apiservice',
      'v1prealpha1.ark.mckinsey.com',
      '--timeout=30s',
    ],
    35000
  );
  return {
    name: 'APIServices available',
    passed: primary.exitCode === 0,
    durationMs: Date.now() - start,
    message:
      primary.exitCode === 0
        ? undefined
        : (primary.stderr || primary.stdout).trim(),
  };
}

async function waitForApiGroup(
  timeoutSeconds: number
): Promise<ReadinessCheckResult> {
  const start = Date.now();
  const deadline = start + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const {stdout, exitCode} = await runKubectl(
      ['api-resources', '--api-group=ark.mckinsey.com', '-o', 'name'],
      10000
    );
    if (exitCode === 0 && /agents\./.test(stdout)) {
      return {
        name: 'API group registered',
        passed: true,
        durationMs: Date.now() - start,
      };
    }
    await sleep(API_GROUP_POLL_INTERVAL_MS);
  }
  return {
    name: 'API group registered',
    passed: false,
    durationMs: Date.now() - start,
    message: 'timed out waiting for ark.mckinsey.com API group',
  };
}

export async function runReadinessChecks(
  timeoutSeconds: number,
  backend: DetectedBackend,
  onProgress?: ReadinessProgress
): Promise<ReadinessCheckResult[]> {
  if (backend === 'etcd') {
    return [];
  }
  if (backend === 'unknown') {
    const result: ReadinessCheckResult = {
      name: 'Storage backend',
      passed: false,
      durationMs: 0,
      message:
        'could not determine storage backend (ARK not installed, cluster unreachable, or access denied)',
    };
    onProgress?.(result);
    return [result];
  }

  const overallStart = Date.now();
  const remaining = () =>
    Math.max(
      1,
      timeoutSeconds - Math.floor((Date.now() - overallStart) / 1000)
    );

  const checks: Array<() => Promise<ReadinessCheckResult>> = [
    () => waitForApiServices(Math.min(remaining(), 120)),
    () => waitForApiGroup(Math.min(remaining(), 300)),
  ];

  const results: ReadinessCheckResult[] = [];
  for (const check of checks) {
    const result = await check();
    results.push(result);
    onProgress?.(result);
    if (!result.passed) {
      break;
    }
  }
  return results;
}
