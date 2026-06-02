import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Code({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M320-255.46 93.85-481.62 321.62-709l32.23 32.62-194.77 194.76 193.53 193.54L320-255.46Zm318.38 1.61-32.23-32.61 194.77-194.77-193.53-193.92L640-707.77l226.15 226.15-227.77 227.77Z" />
    </svg>
  );
}
