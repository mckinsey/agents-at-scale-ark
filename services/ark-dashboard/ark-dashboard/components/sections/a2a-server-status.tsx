import { StatusBadge } from '@/components/ui/badge';

interface A2AServerStatusProps {
  readonly ready?: boolean | null;
}

const STATUS_CONFIG = {
  True: { label: 'Available', variant: 'success' },
  False: { label: 'Unavailable', variant: 'error' },
  Unknown: { label: 'Unknown', variant: 'neutral' },
} as const;

function statusKey(ready?: boolean | null): keyof typeof STATUS_CONFIG {
  if (ready === null || ready === undefined) {
    return 'Unknown';
  }
  return ready ? 'True' : 'False';
}

export function A2AServerStatus({ ready }: Readonly<A2AServerStatusProps>) {
  const { label, variant } = STATUS_CONFIG[statusKey(ready)];

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge variant={variant} role="img" aria-label={label} />
      <span className="label-regular-primary text-fg-primary">{label}</span>
    </span>
  );
}
