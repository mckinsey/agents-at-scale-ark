import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ArrowUpwardAlt({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M458.92-256.69v-405.39L285.85-491.23l-32-32.62 226.77-226.76 227.15 226.76-32 32-171.46-171.46v406.62h-45.39Z" />
    </svg>
  );
}
