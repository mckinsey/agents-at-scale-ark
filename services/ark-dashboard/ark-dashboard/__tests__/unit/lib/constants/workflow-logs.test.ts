import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_NAMES = {
  pageLines: 'NEXT_PUBLIC_WORKFLOW_LOG_PAGE_LINES',
  maxBytes: 'NEXT_PUBLIC_WORKFLOW_LOG_MAX_BYTES',
  pollIntervalMs: 'NEXT_PUBLIC_WORKFLOW_LOG_POLL_INTERVAL_MS',
} as const;

const FALLBACKS = {
  pageLines: 1000,
  maxBytes: 1024 * 1024,
  pollIntervalMs: 3000,
} as const;

async function loadConstants() {
  return import('@/lib/constants/workflow-logs');
}

function stubAll(value: string) {
  Object.values(ENV_NAMES).forEach(name => {
    vi.stubEnv(name, value);
  });
}

describe('workflow-logs constants', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(ENV_NAMES).forEach(name => {
      vi.stubEnv(name, undefined);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use the fallbacks when the env vars are unset', async () => {
    const constants = await loadConstants();

    expect(constants.WORKFLOW_LOG_PAGE_LINES).toBe(FALLBACKS.pageLines);
    expect(constants.WORKFLOW_LOG_MAX_BYTES).toBe(FALLBACKS.maxBytes);
    expect(constants.WORKFLOW_LOG_POLL_INTERVAL_MS).toBe(
      FALLBACKS.pollIntervalMs,
    );
  });

  it('should use valid integer strings', async () => {
    vi.stubEnv(ENV_NAMES.pageLines, '250');
    vi.stubEnv(ENV_NAMES.maxBytes, '4096');
    vi.stubEnv(ENV_NAMES.pollIntervalMs, '750');

    const constants = await loadConstants();

    expect(constants.WORKFLOW_LOG_PAGE_LINES).toBe(250);
    expect(constants.WORKFLOW_LOG_MAX_BYTES).toBe(4096);
    expect(constants.WORKFLOW_LOG_POLL_INTERVAL_MS).toBe(750);
  });

  it.each(['0', '-5', 'abc', '', 'Infinity'])(
    'should fall back when the value is %j',
    async value => {
      stubAll(value);

      const constants = await loadConstants();

      expect(constants.WORKFLOW_LOG_PAGE_LINES).toBe(FALLBACKS.pageLines);
      expect(constants.WORKFLOW_LOG_MAX_BYTES).toBe(FALLBACKS.maxBytes);
      expect(constants.WORKFLOW_LOG_POLL_INTERVAL_MS).toBe(
        FALLBACKS.pollIntervalMs,
      );
    },
  );

  it('should floor fractional values', async () => {
    stubAll('2.7');

    const constants = await loadConstants();

    expect(constants.WORKFLOW_LOG_PAGE_LINES).toBe(2);
    expect(constants.WORKFLOW_LOG_MAX_BYTES).toBe(2);
    expect(constants.WORKFLOW_LOG_POLL_INTERVAL_MS).toBe(2);
  });
});
