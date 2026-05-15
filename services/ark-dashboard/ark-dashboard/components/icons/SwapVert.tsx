import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function SwapVert({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M11.2547 16.7095V6.52816L7.18633 10.6052L6 9.42583L12.0923 3.3335L18.1847 9.42583L16.9983 10.6052L12.93 6.52816V16.7095H11.2547ZM19.895 28.6668L13.8027 22.5745L14.989 21.3952L19.0573 25.4722V15.2908H20.7323V25.4722L24.8093 21.3952L25.987 22.5745L19.895 28.6668Z" />
    </svg>
  );
}
