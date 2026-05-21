import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ChatBubble({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M1.6001 14.4001V1.6001H14.4001V12.0001H4.0001L1.6001 14.4001ZM3.5001 10.8001H13.2001V2.8001H2.8001V11.5001L3.5001 10.8001Z" />
    </svg>
  );
}
