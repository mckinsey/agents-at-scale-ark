import {execa} from 'execa';

export type StorageBackend = 'etcd' | 'postgresql';

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
