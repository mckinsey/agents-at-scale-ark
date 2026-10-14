import { describe, expect, it } from 'vitest';

import {
  INSTALL_STAGES,
  INSTALL_TIMEOUT_MS,
  INSTALL_TOTAL_DURATION_MS,
  deriveOutcome,
  deriveStages,
  elapsedSince,
} from './marketplace-install-mock';

const CLEAN_ID = 'a2a-inspector';
const FAILING_ID = 'ark-sandbox';

function stageStates(id: string, elapsed: number): string[] {
  return deriveStages(id, elapsed).map(stage => stage.state);
}

describe('elapsedSince', () => {
  it('measures forward from an ISO timestamp', () => {
    const started = '2026-01-01T00:00:00.000Z';
    expect(elapsedSince(started, Date.parse(started) + 5000)).toBe(5000);
  });

  it('never returns a negative elapsed for a clock skewed backwards', () => {
    const started = '2026-01-01T00:00:10.000Z';
    expect(elapsedSince(started, Date.parse(started) - 5000)).toBe(0);
  });

  it('treats an unparseable timestamp as zero elapsed', () => {
    expect(elapsedSince('not-a-date', Date.now())).toBe(0);
  });
});

describe('deriveStages', () => {
  it('shows nothing started at zero elapsed', () => {
    expect(stageStates(CLEAN_ID, 0)).toEqual([
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('advances one stage at a time', () => {
    const afterFirst = INSTALL_STAGES[0].durationMs + 1;
    expect(stageStates(CLEAN_ID, afterFirst)).toEqual([
      'done',
      'running',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('marks every stage done once the full duration has passed', () => {
    expect(stageStates(CLEAN_ID, INSTALL_TOTAL_DURATION_MS)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('stops at the failing stage and leaves the rest pending', () => {
    const states = stageStates(FAILING_ID, INSTALL_TOTAL_DURATION_MS);
    expect(states).toEqual(['done', 'done', 'done', 'failed', 'pending']);
  });

  it('is pure — the same elapsed always yields the same stages', () => {
    expect(deriveStages(CLEAN_ID, 3000)).toEqual(deriveStages(CLEAN_ID, 3000));
  });
});

describe('deriveOutcome', () => {
  it('stays in flight until the total duration elapses', () => {
    expect(deriveOutcome(CLEAN_ID, INSTALL_TOTAL_DURATION_MS - 1)).toBeNull();
  });

  it('completes at the total duration', () => {
    expect(deriveOutcome(CLEAN_ID, INSTALL_TOTAL_DURATION_MS)).toEqual({
      state: 'installed',
    });
  });

  it('fails at the fixture stage rather than completing', () => {
    const outcome = deriveOutcome(FAILING_ID, INSTALL_TOTAL_DURATION_MS);
    expect(outcome).toEqual({ state: 'failed', failedStage: 'apply' });
  });

  it('times out, which is what releases a wedged namespace', () => {
    expect(deriveOutcome(CLEAN_ID, INSTALL_TIMEOUT_MS)).toEqual({
      state: 'timed-out',
    });
  });

  it('prefers the timeout over any other outcome', () => {
    expect(deriveOutcome(FAILING_ID, INSTALL_TIMEOUT_MS + 1)).toEqual({
      state: 'timed-out',
    });
  });

  it('leaves room between completion and timeout', () => {
    expect(INSTALL_TIMEOUT_MS).toBeGreaterThan(INSTALL_TOTAL_DURATION_MS);
  });
});
