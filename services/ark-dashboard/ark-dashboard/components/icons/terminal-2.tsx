import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Terminal2({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M480-192V-264H768V-192H480ZM246-336L195-387L360-552L195-717L246-768L462-552L246-336Z" />
    </svg>
  );
}
