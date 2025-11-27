import { describe, expect, it } from 'vitest';

import { mapTaskPhaseToVariant } from '@/components/sections/a2a-tasks-section/utils';
import { A2ATaskPhase } from '@/lib/services/a2a-tasks';

describe('mapTaskPhaseToVariant', () => {
  it.each([
    { phase: 'completed', expected: 'completed' },
    { phase: 'running', expected: 'running' },
    { phase: 'assigned', expected: 'running' },
    { phase: 'failed', expected: 'failed' },
    { phase: 'cancelled', expected: 'failed' },
    { phase: 'pending', expected: 'pending' },
    { phase: 'input-required', expected: 'pending' },
    { phase: 'auth-required', expected: 'pending' },
    { phase: 'unknown', expected: 'unknown' },
    { phase: 'some-random-string', expected: 'unknown' },
    { phase: undefined, expected: 'unknown' },
  ])(
    'should return "$expected" variant for "$phase" phase',
    ({ phase, expected }) => {
      expect(mapTaskPhaseToVariant(phase as A2ATaskPhase)).toBe(expected);
    },
  );

  it('should accept enum values directly', () => {
    expect(mapTaskPhaseToVariant(A2ATaskPhase.COMPLETED)).toBe('completed');
    expect(mapTaskPhaseToVariant(A2ATaskPhase.RUNNING)).toBe('running');
    expect(mapTaskPhaseToVariant(A2ATaskPhase.FAILED)).toBe('failed');
  });
});
