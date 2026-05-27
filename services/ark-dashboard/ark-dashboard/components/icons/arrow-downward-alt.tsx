import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ArrowDownwardAlt({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M479.38-253.85 252.23-480.62l32-32.61 173.08 170.46v-405h45.38v406.62l171.46-171.46 32 31.99-226.77 226.77Z" />
    </svg>
  );
}
