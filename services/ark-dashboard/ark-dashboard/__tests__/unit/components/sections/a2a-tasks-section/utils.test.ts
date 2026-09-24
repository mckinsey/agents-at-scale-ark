import { describe, expect, it } from 'vitest';

import { mapTaskPhaseToStatus } from '@/components/sections/a2a-tasks-section/utils';
import { A2ATaskPhase } from '@/lib/services/a2a-tasks';

describe('mapTaskPhaseToStatus', () => {
  it.each([
    { phase: 'completed', label: 'Completed', variant: 'success' },
    { phase: 'running', label: 'Running', variant: 'neutral-brand' },
    { phase: 'assigned', label: 'Assigned', variant: 'neutral-brand' },
    { phase: 'pending', label: 'Pending', variant: 'warning' },
    { phase: 'input-required', label: 'Input required', variant: 'warning' },
    { phase: 'auth-required', label: 'Auth required', variant: 'warning' },
    { phase: 'failed', label: 'Failed', variant: 'error' },
    { phase: 'cancelled', label: 'Cancelled', variant: 'neutral' },
    { phase: 'unknown', label: 'Unknown', variant: 'neutral' },
    { phase: 'some-random-string', label: 'Unknown', variant: 'neutral' },
    { phase: undefined, label: 'Unknown', variant: 'neutral' },
  ])('maps "$phase" to $label/$variant', ({ phase, label, variant }) => {
    expect(mapTaskPhaseToStatus(phase)).toEqual({ label, variant });
  });

  it('is case insensitive', () => {
    expect(mapTaskPhaseToStatus('COMPLETED')).toEqual({
      label: 'Completed',
      variant: 'success',
    });
  });

  it('accepts enum values directly', () => {
    expect(mapTaskPhaseToStatus(A2ATaskPhase.COMPLETED).label).toBe(
      'Completed',
    );
    expect(mapTaskPhaseToStatus(A2ATaskPhase.RUNNING).label).toBe('Running');
    expect(mapTaskPhaseToStatus(A2ATaskPhase.FAILED).label).toBe('Failed');
  });
});
