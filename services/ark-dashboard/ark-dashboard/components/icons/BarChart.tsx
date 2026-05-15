import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function BarChart({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M3.3335 27.171V25.4957H28.6668V27.171H3.3335ZM4.66683 23.3247V15.3334H7.6755V23.3247H4.66683ZM11.2018 23.3247V8.66669H14.2105V23.3247H11.2018ZM17.7635 23.3247V12.6667H20.7718V23.3247H17.7635ZM24.3248 23.3247V4.66669H27.3335V23.3247H24.3248Z" />
    </svg>
  );
}
