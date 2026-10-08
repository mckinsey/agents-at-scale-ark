import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Pause({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M528 -192V-768H768V-192H528ZM192 -192V-768H432V-192H192ZM600 -264H696V-696H600V-264ZM264 -264H360V-696H264V-264Z" />
    </svg>
  );
}
