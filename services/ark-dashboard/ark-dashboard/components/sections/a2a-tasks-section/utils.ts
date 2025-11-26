import { type A2ATaskPhase } from '@/lib/services/a2a-tasks';

import { type StatusDotVariant } from './status-dot';

export const mapTaskPhaseToVariant = (
  phase?: A2ATaskPhase,
): StatusDotVariant => {
  if (!phase) {
    return 'unknown';
  }

  const normalizedPhase = phase?.toLowerCase();
  switch (normalizedPhase) {
    case 'completed':
      return 'completed';
    case 'running':
    case 'assigned':
      return 'running';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'input-required':
    case 'auth-required':
    case 'pending':
      return 'pending';
    default:
      return 'unknown';
  }
};
