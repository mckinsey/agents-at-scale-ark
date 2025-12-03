import { A2ATaskPhase } from '@/lib/services/a2a-tasks';

import { type StatusDotVariant } from './status-dot';

export const mapTaskPhaseToVariant = (phase?: string): StatusDotVariant => {
  if (!phase) {
    return 'unknown';
  }

  const normalizedPhase = phase.toLowerCase();
  switch (normalizedPhase) {
    case A2ATaskPhase.COMPLETED:
      return 'completed';
    case A2ATaskPhase.RUNNING:
    case A2ATaskPhase.ASSIGNED:
      return 'running';
    case A2ATaskPhase.FAILED:
    case A2ATaskPhase.CANCELLED:
      return 'failed';
    case A2ATaskPhase.INPUT_REQUIRED:
    case A2ATaskPhase.AUTH_REQUIRED:
    case A2ATaskPhase.PENDING:
      return 'pending';
    default:
      return 'unknown';
  }
};
