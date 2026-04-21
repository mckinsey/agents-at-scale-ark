import {execa} from 'execa';

export type StorageBackend = 'etcd' | 'postgresql';

export interface ReadinessCheckResult {
  name: string;
  passed: boolean;
  durationMs: number;
  message?: string;
}

export type ReadinessProgress = (result: ReadinessCheckResult) => void;

const PROBE_NAMESPACE = 'ark-readiness-probe';
const PROBE_MODEL_NAME = 'readiness-probe';
const STABLE_CONSECUTIVE_REQUIRED = 10;
const STABLE_POLL_INTERVAL_MS = 2000;
const API_GROUP_POLL_INTERVAL_MS = 10000;
const PROBE_POLL_INTERVAL_MS = 1000;

const PROBE_MODEL_MANIFEST = `apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: ${PROBE_MODEL_NAME}
  namespace: ${PROBE_NAMESPACE}
spec:
  type: openai
  model:
    value: gpt-4.1-mini
  config:
    openai:
      baseUrl:
        value: "https://localhost:1/v1"
      apiKey:
        value: "probe"
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runKubectl(
  args: string[],
  timeoutMs: number,
  input?: string
): Promise<{exitCode: number; stdout: string; stderr: string}> {
  const result = await execa('kubectl', args, {
    timeout: timeoutMs,
    reject: false,
    input,
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function detectStorageBackend(): Promise<StorageBackend> {
  const {exitCode} = await runKubectl(
    ['get', 'crd', 'agents.ark.mckinsey.com'],
    10000
  );
  return exitCode === 0 ? 'etcd' : 'postgresql';
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

async function waitForAggregatedApiStable(
  timeoutSeconds: number
): Promise<ReadinessCheckResult> {
  const start = Date.now();
  const deadline = start + timeoutSeconds * 1000;
  let consecutive = 0;
  while (Date.now() < deadline) {
    const probes = await Promise.all([
      runKubectl(
        ['get', 'agents.ark.mckinsey.com', '-A', '--request-timeout=5s'],
        10000
      ),
      runKubectl(
        ['get', 'models.ark.mckinsey.com', '-A', '--request-timeout=5s'],
        10000
      ),
      runKubectl(
        ['get', 'queries.ark.mckinsey.com', '-A', '--request-timeout=5s'],
        10000
      ),
    ]);
    if (probes.every((p) => p.exitCode === 0)) {
      consecutive += 1;
      if (consecutive >= STABLE_CONSECUTIVE_REQUIRED) {
        return {
          name: 'Aggregated API stable',
          passed: true,
          durationMs: Date.now() - start,
          message: `${consecutive} consecutive probes`,
        };
      }
    } else {
      consecutive = 0;
    }
    await sleep(STABLE_POLL_INTERVAL_MS);
  }
  return {
    name: 'Aggregated API stable',
    passed: false,
    durationMs: Date.now() - start,
    message: `only ${consecutive} consecutive successes (need ${STABLE_CONSECUTIVE_REQUIRED})`,
  };
}

async function waitForControllerReconciling(
  timeoutSeconds: number
): Promise<ReadinessCheckResult> {
  const start = Date.now();
  await runKubectl(['create', 'namespace', PROBE_NAMESPACE], 15000);
  const apply = await runKubectl(
    ['apply', '-f', '-'],
    15000,
    PROBE_MODEL_MANIFEST
  );
  if (apply.exitCode !== 0) {
    await runKubectl(
      ['delete', 'namespace', PROBE_NAMESPACE, '--wait=false'],
      10000
    );
    return {
      name: 'Controllers reconciling',
      passed: false,
      durationMs: Date.now() - start,
      message: `failed to apply probe Model: ${(apply.stderr || apply.stdout).trim()}`,
    };
  }

  const deadline = start + timeoutSeconds * 1000;
  let passed = false;
  while (Date.now() < deadline) {
    const {stdout, exitCode} = await runKubectl(
      [
        'get',
        'model',
        PROBE_MODEL_NAME,
        '-n',
        PROBE_NAMESPACE,
        '-o',
        'jsonpath={.status.conditions}',
      ],
      10000
    );
    if (exitCode === 0 && stdout && stdout !== 'null' && stdout !== '[]') {
      passed = true;
      break;
    }
    await sleep(PROBE_POLL_INTERVAL_MS);
  }

  await runKubectl(
    ['delete', 'namespace', PROBE_NAMESPACE, '--wait=false'],
    10000
  );

  return {
    name: 'Controllers reconciling',
    passed,
    durationMs: Date.now() - start,
    message: passed
      ? undefined
      : 'probe Model got no status conditions within timeout',
  };
}

export async function runReadinessChecks(
  timeoutSeconds: number,
  onProgress?: ReadinessProgress
): Promise<ReadinessCheckResult[]> {
  const backend = await detectStorageBackend();
  if (backend === 'etcd') {
    return [];
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
    () => waitForAggregatedApiStable(Math.min(remaining(), 120)),
    () => waitForControllerReconciling(Math.min(remaining(), 60)),
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
