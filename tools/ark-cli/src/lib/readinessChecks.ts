import {execa} from 'execa';

export type StorageBackend = 'etcd' | 'postgresql';

/**
 * Detection result. Widens StorageBackend with 'unknown' for the cases where we
 * cannot confidently determine the backend (ARK not installed, cluster
 * unreachable, RBAC denied, or a transient kubectl error).
 */
export type DetectedBackend = StorageBackend | 'unknown';

/**
 * Finer-grained detection outcome. Splits 'unknown' into the actual situations
 * so callers can tell the user *where* they are, not just that detection failed.
 */
export type BackendStatus =
  | 'etcd'
  | 'postgresql'
  | 'not-installed'
  | 'unreachable'
  | 'forbidden'
  | 'undetermined';

export interface BackendDetection {
  /** Coarse backend used for branching: 'etcd' | 'postgresql' | 'unknown'. */
  backend: DetectedBackend;
  /** Specific situation behind the backend value. */
  status: BackendStatus;
  /** Human-readable explanation suitable for CLI output. */
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

/**
 * Classify a failed kubectl probe by its stderr.
 * - 'not-found'     the API server answered: the resource is genuinely absent.
 * - 'forbidden'     RBAC denied the read — we cannot see cluster state.
 * - 'unreachable'   connection refused / timeout / bad host or context.
 * - 'undetermined'  empty or unrecognized error — don't guess.
 */
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

/**
 * A kubectl result is authoritative when the API server actually answered:
 * success, or a definitive negative the server returned (NotFound / Forbidden).
 * Retrying those would never change the outcome. Anything else (connection
 * refused, timeout, bad context, empty stderr) is treated as transient.
 */
function isAuthoritativeResult(result: {
  exitCode: number;
  stderr: string;
}): boolean {
  if (result.exitCode === 0) {
    return true;
  }
  return /not\s*found|forbidden/i.test(result.stderr);
}

/**
 * Run a detection probe, retrying only on transient failures so a single
 * connection blip against a healthy cluster does not collapse to 'unknown'.
 * Authoritative answers (success / NotFound / Forbidden) return immediately.
 */
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

/** Build the 'unknown' detection for a non-'not-found' probe failure. */
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

/**
 * Detect the storage backend ARK is running, with the specific situation.
 *
 * - CRD present                      → etcd
 * - CRD absent + aggregated API live → postgresql (positively confirmed)
 * - CRD absent + no aggregated API   → not-installed
 * - probe forbidden / unreachable /
 *   unrecognized                     → unknown (we never assert a backend we
 *   cannot prove)
 */
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

  // CRD is genuinely absent — positively confirm postgresql by checking the
  // aggregated APIService it relies on, rather than assuming.
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

/**
 * Coarse backend for branching. Thin wrapper over {@link describeStorageBackend}
 * for callers that only need 'etcd' | 'postgresql' | 'unknown'.
 */
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
  onProgress?: ReadinessProgress
): Promise<ReadinessCheckResult[]> {
  const detection = await describeStorageBackend();
  if (detection.backend === 'etcd') {
    return [];
  }
  if (detection.backend === 'unknown') {
    const start = Date.now();
    const result: ReadinessCheckResult = {
      name: 'Storage backend',
      passed: false,
      durationMs: Date.now() - start,
      message: detection.message,
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
