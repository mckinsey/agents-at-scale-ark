import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function GridOn({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M140-140v-680h680v680H140Zm60-60h146.46v-146.46H200V-200Zm206.46 0h147.08v-146.46H406.46V-200Zm207.08 0H760v-146.46H613.54V-200ZM200-406.46h146.46v-147.08H200v147.08Zm206.46 0h147.08v-147.08H406.46v147.08Zm207.08 0H760v-147.08H613.54v147.08ZM200-613.54h146.46V-760H200v146.46Zm206.46 0h147.08V-760H406.46v146.46Zm207.08 0H760V-760H613.54v146.46Z" />
    </svg>
  );
}
