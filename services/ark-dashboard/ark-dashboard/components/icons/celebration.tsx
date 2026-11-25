import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Celebration({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="m80-80 200-560 360 360L80-80Zm132-132 282-100-182-182-100 282Zm370-246-42-42 301-301 101 101-42 42-59-59-259 259ZM422-618l-42-42 58-58-60-60 42-42 102 102-100 100Zm80 80-42-42 179-179-99-99 42-42 141 141-221 221Zm160 160-42-42 141-141 141 141-42 42-99-99-99 99ZM212-212Z" />
    </svg>
  );
}
