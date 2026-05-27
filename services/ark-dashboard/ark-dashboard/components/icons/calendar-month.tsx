import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function CalendarMonth({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M444.62-396.92v-70.77h70.76v70.77h-70.76Zm-160 0v-70.77h70.76v70.77h-70.76Zm320 0v-70.77h70.76v70.77h-70.76ZM444.62-240v-70.77h70.76V-240h-70.76Zm-160 0v-70.77h70.76V-240h-70.76Zm320 0v-70.77h70.76V-240h-70.76ZM140-100v-694.61h131.54v-70h50.38v70h317.69v-70h49.23v70H820V-100H140Zm45.39-45.39h589.22V-555H185.39v409.61Zm0-454.99h589.22v-148.85H185.39v148.85Zm0 0v-148.85 148.85Z" />
    </svg>
  );
}
