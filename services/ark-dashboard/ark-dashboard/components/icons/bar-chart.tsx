import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function BarChart({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M654.61-180v-236.15H780V-180H654.61Zm-237.3 0v-600h125.38v600H417.31ZM180-180v-403.84h125.39V-180H180Z" />
    </svg>
  );
}
