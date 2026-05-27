import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function SaveAlt({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M480-323.39 314.31-489.08l32.61-32.23 110.39 110V-780h45.38v368.69l110.39-110 32.61 32.23L480-323.39ZM180-180v-183h45.39v137.61h509.22V-363H780v183H180Z" />
    </svg>
  );
}
