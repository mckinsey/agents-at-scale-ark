import { cn } from '@/lib/utils';

type EventTypeKind = 'warning' | 'normal' | 'other';

interface EventTypeIndicatorProps {
  readonly type: string | undefined | null;
  readonly className?: string;
}

const TEXT_CLASS: Record<EventTypeKind, string> = {
  warning: 'text-fg-warning',
  normal: 'text-fg-success',
  other: 'text-fg-primary',
};

function eventTypeKind(type: string): EventTypeKind {
  switch (type.toLowerCase()) {
    case 'warning':
      return 'warning';
    case 'normal':
      return 'normal';
    default:
      return 'other';
  }
}

export function EventTypeIndicator({
  type,
  className,
}: Readonly<EventTypeIndicatorProps>) {
  if (!type) {
    return <span className="text-fg-secondary">—</span>;
  }

  return (
    <span
      className={cn(
        'label-regular-primary block w-full truncate',
        TEXT_CLASS[eventTypeKind(type)],
        className,
      )}>
      {type}
    </span>
  );
}
