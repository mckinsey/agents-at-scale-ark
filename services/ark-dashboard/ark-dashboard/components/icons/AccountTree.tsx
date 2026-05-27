import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function AccountTree({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M612.85-130v-123.85H457.31v-407.3H347.77v127.3H90V-830h257.77v123.46h265.08V-830H870v296.15H612.85v-127.3H502.69v361.92h110.16v-127.31H870V-130H612.85ZM135.38-784.62v205.39-205.39Zm522.85 403.47v205.77-205.77Zm0-403.47v205.39-205.39Zm0 205.39h166.39v-205.39H658.23v205.39Zm0 403.85h166.39v-205.77H658.23v205.77ZM135.38-579.23h167.01v-205.39H135.38v205.39Z" />
    </svg>
  );
}
