import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Earthquake({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M8.525 21.5L5.84625 12.75H2.5V11.25H6.95575L8.975 17.7962L12.3828 2.5H13.5595L16.0057 13.0213L17.775 7.35575H18.8443L20.3153 11.25H21.4902V12.75H19.252L18.3828 10.4115L16.4365 16.6443H15.2962L12.9712 6.64025L9.675 21.5H8.525Z" />
    </svg>
  );
}
