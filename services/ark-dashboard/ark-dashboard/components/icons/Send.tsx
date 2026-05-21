import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Send({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M14.6668 1.3335L7.3335 8.66683" />
      <path d="M14.6668 1.3335L10.0002 14.6668L7.3335 8.66683L1.3335 6.00016L14.6668 1.3335Z" />
    </svg>
  );
}
