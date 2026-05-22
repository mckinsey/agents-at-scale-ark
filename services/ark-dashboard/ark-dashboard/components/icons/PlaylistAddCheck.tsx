import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function PlaylistAddCheck({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M130-337.92v-45.39h289.85v45.39H130Zm0-163.85v-45.38h454.92v45.38H130Zm0-163.46v-45.38h454.92v45.38H130Zm522.38 450.77L528.69-338.54l32-32.61 91.69 91.46 181.16-180.77 32.61 32.23-213.77 213.77Z" />
    </svg>
  );
}
