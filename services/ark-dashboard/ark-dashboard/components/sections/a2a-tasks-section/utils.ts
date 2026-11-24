import type { ComponentProps } from 'react';

import { StatusBadge } from '@/components/ui/badge';
import { A2ATaskPhase } from '@/lib/services/a2a-tasks';

export type TaskStatusVariant = NonNullable<
  ComponentProps<typeof StatusBadge>['variant']
>;

export interface TaskStatusConfig {
  label: string;
  variant: TaskStatusVariant;
}

const PHASE_CONFIG: Record<string, TaskStatusConfig> = {
  [A2ATaskPhase.COMPLETED]: { label: 'Completed', variant: 'success' },
  [A2ATaskPhase.RUNNING]: { label: 'Running', variant: 'neutral-brand' },
  [A2ATaskPhase.ASSIGNED]: { label: 'Assigned', variant: 'neutral-brand' },
  [A2ATaskPhase.PENDING]: { label: 'Pending', variant: 'warning' },
  [A2ATaskPhase.INPUT_REQUIRED]: {
    label: 'Input required',
    variant: 'warning',
  },
  [A2ATaskPhase.AUTH_REQUIRED]: { label: 'Auth required', variant: 'warning' },
  [A2ATaskPhase.FAILED]: { label: 'Failed', variant: 'error' },
  [A2ATaskPhase.CANCELLED]: { label: 'Cancelled', variant: 'neutral' },
};

const UNKNOWN_STATUS: TaskStatusConfig = {
  label: 'Unknown',
  variant: 'neutral',
};

export const mapTaskPhaseToStatus = (phase?: string): TaskStatusConfig => {
  if (!phase) {
    return UNKNOWN_STATUS;
  }

  return PHASE_CONFIG[phase.toLowerCase()] ?? UNKNOWN_STATUS;
};
