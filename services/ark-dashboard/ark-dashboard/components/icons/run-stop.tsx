import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function RunStop({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M264 -264V-696H696V-264H264ZM336 -336H624V-624H336V-336Z" />
    </svg>
  );
}
