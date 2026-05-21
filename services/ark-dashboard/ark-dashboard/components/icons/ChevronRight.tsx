import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ChevronRight({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M8.63075 7.99993L5.56409 4.93326L6.26664 4.23071L10.0359 7.99993L6.26664 11.7691L5.56409 11.0666L8.63075 7.99993Z" />
    </svg>
  );
}
