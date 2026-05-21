import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function SingleTool({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M10.3333 1.3335C9.2 1.3335 8.33333 2.20016 8.33333 3.3335C8.33333 3.60016 8.4 3.86683 8.53333 4.06683L2 10.6668L3.33333 12.0002L9.93333 5.46683C10.1333 5.60016 10.4 5.66683 10.6667 5.66683C11.8 5.66683 12.6667 4.80016 12.6667 3.66683C12.6667 3.40016 12.6 3.1335 12.4667 2.9335L11 4.40016L10.2667 3.66683L11.7333 2.20016C11.5333 1.66683 11 1.3335 10.3333 1.3335Z" />
      <path d="M3.3334 9.3335L2.3334 10.3335C1.86673 10.8002 1.86673 11.5335 2.3334 12.0002C2.80007 12.4668 3.5334 12.4668 4.00007 12.0002L5.00007 11.0002" />
    </svg>
  );
}
