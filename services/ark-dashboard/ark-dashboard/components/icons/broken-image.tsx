import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function BrokenImage({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M140-140v-680h680v680H140Zm87.62-285.92 168.92-168.93 167.31 167.31 167.92-167.92 42.84 42.85v-222H185.39v306.46l42.23 42.23Zm-42.23 240.53h589.22V-488l-42.84-42.85-167.92 167.93-167.31-167.31-168.92 168.54-42.23-41.85v218.15Zm0 0V-488v45.38-331.99 589.22Z" />
    </svg>
  );
}
