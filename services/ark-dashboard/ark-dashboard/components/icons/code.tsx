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
      <path d="m320-240-240-240 240-240 56 57-184 183 184 183-56 57Zm320 0-56-57 184-183-184-183 56-57 240 240-240 240Z" />
    </svg>
  );
}
