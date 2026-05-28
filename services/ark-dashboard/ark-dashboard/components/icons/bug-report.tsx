import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function BugReport({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M480-120q-65 0-120.5-32T272-238q-29-50-44-110.5T213-460H140v-40h73q1-29 4-55t11-50H140v-40h103q12-28 30-50.5t41-37.5l-72-73 28-28 87 87q26-12 56-18.5t67-6.5q37 0 67 6.5t56 18.5l87-87 28 28-72 73q23 15 41 37.5t30 50.5h103v40h-88q8 24 11 50t4 55h73v40h-73q0 56-15 116.5T688-238q-32 54-87.5 86T480-120Zm0-40q86 0 143-60.5t57-159.5v-240H280v240q0 99 57 159.5T480-160Zm-80-120h160v-40H400v40Zm0-120h160v-40H400v40Z" />
    </svg>
  );
}
