import { StatusBadge } from '@/components/ui/badge';

interface A2AServerStatusProps {
  readonly ready?: boolean | null;
}

export function A2AServerStatus({ ready }: Readonly<A2AServerStatusProps>) {
  const label = ready ? 'Available' : 'Unavailable';

  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge
        variant={ready ? 'success' : 'error'}
        role="img"
        aria-label={label}
      />
      <span className="label-regular-primary text-fg-primary">{label}</span>
    </span>
  );
}
