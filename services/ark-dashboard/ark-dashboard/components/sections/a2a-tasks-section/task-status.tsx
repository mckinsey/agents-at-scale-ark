import { StatusBadge } from '@/components/ui/badge';

import { mapTaskPhaseToStatus } from './utils';

export interface TaskStatusProps {
  readonly phase?: string;
}

export function TaskStatus({ phase }: TaskStatusProps) {
  const { label, variant } = mapTaskPhaseToStatus(phase);

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge variant={variant} role="img" aria-label={label} />
      <span className="label-regular-primary text-fg-primary">{label}</span>
    </span>
  );
}
