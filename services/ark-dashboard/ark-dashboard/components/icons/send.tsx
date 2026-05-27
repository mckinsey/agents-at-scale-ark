import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Send({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M140-190v-580l688.46 290L140-190Zm45.39-70.31L710.54-480 185.39-701.92v168L403.92-480l-218.53 52.31v167.38Zm0 0v-441.61 441.61Z" />
    </svg>
  );
}
