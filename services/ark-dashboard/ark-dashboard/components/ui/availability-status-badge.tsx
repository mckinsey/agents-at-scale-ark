import Link from 'next/link';
import type { ComponentProps } from 'react';

import type { components } from '@/lib/api/generated/types';
import { cn } from '@/lib/utils';

export type AvailabilityStatus = components['schemas']['AvailabilityStatus'];

interface AvailabilityStatusBadgeProps {
  readonly status?: AvailabilityStatus | null;
  readonly eventsLink?: ComponentProps<typeof Link>['href'];
  readonly className?: string;
}

// Status configuration mapping
const STATUS_CONFIG = {
  True: {
    text: 'Available',
    className: 'bg-green-100 text-green-800 hover:bg-green-200',
  },
  False: {
    text: 'Unavailable',
    className: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
  Unknown: {
    text: 'Unknown',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
  },
} as const;

/**
 * AvailabilityStatusBadge component renders availability status with appropriate styling
 * Can be used for agents, models, or any resource with availability status
 */
export function AvailabilityStatusBadge({
  status,
  eventsLink,
  className,
}: AvailabilityStatusBadgeProps) {
  const statusValue = status || 'Unknown';
  const config = STATUS_CONFIG[statusValue];

  const badgeContent = (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-1 text-xs font-medium transition-colors',
        config.className,
        className,
      )}>
      {config.text}
    </span>
  );

  // If eventsLink is provided, wrap in a Link component
  if (eventsLink) {
    return (
      <Link href={eventsLink} title="View events">
        {badgeContent}
      </Link>
    );
  }

  return badgeContent;
}
