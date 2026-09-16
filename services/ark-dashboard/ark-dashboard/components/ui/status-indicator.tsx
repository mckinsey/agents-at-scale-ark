import type { ReactNode } from 'react';

import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { cn } from '@/lib/utils';

export interface StatusConfig {
  label: string;
  dotClass: string;
}

export type AvailabilityValue = 'True' | 'False' | 'Unknown';

export const UNKNOWN_STATUS: StatusConfig = {
  label: 'Unknown',
  dotClass: 'bg-fg-tertiary',
};

export const AVAILABILITY_STATUS_CONFIG: Record<
  AvailabilityValue,
  StatusConfig
> = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: UNKNOWN_STATUS,
};

export function getAvailabilityStatus(value?: string | null): StatusConfig {
  if (value === 'True' || value === 'False') {
    return AVAILABILITY_STATUS_CONFIG[value];
  }
  return UNKNOWN_STATUS;
}

interface StatusIndicatorProps {
  readonly label: string;
  readonly dotClass: string;
  readonly truncate?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function StatusIndicator({
  label,
  dotClass,
  truncate = false,
  className,
  children,
}: StatusIndicatorProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        truncate && 'w-full min-w-0',
        className,
      )}>
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', dotClass)}
      />
      {truncate ? (
        <TruncatedTooltip label={label}>
          <span className="label-regular-primary text-fg-primary block truncate">
            {label}
          </span>
        </TruncatedTooltip>
      ) : (
        <span className="label-regular-primary text-fg-primary">{label}</span>
      )}
      {children}
    </span>
  );
}
