import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Dns({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M290.37-695.46q-17.83 0-30.22 12.48-12.38 12.48-12.38 30.31 0 17.82 12.48 30.21 12.48 12.38 30.31 12.38 17.82 0 30.21-12.48 12.38-12.48 12.38-30.3 0-17.83-12.48-30.22-12.48-12.38-30.3-12.38Zm0 385.54q-17.83 0-30.22 12.48-12.38 12.48-12.38 30.3 0 17.83 12.48 30.22 12.48 12.38 30.31 12.38 17.82 0 30.21-12.48 12.38-12.48 12.38-30.31 0-17.82-12.48-30.21-12.48-12.38-30.3-12.38ZM140-497.85v-309.22h680v309.22H140Zm45.39-263.84v218.46h589.22v-218.46H185.39ZM140-112.31v-309.84h680v309.84H140Zm45.39-264.46v219.08h589.22v-219.08H185.39Zm0-384.92v218.46-218.46Zm0 384.92v219.08-219.08Z" />
    </svg>
  );
}
