import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Earthquake({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M345.46-100 239.54-457.31H100v-45.38h173.77l85.85 286.61L501-860h35.69L638-410.54l77.46-255.23h33.23l59.46 163.08h51.46v45.38h-84.46l-40.46-112.61-82.31 275.69h-34.84l-98.69-433.85L381.31-100h-35.85Z" />
    </svg>
  );
}
