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

function classifyFailure(stderr: string): FailureReason {
  if (/not\s*found/i.test(stderr)) {
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
  return /not\s*found|forbidden/i.test(result.stderr);
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
