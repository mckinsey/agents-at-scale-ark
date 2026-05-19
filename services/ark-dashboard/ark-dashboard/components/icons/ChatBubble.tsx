import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ChatBubble({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M3.33301 28.0513V3.33331H28.6663V23.3333H8.05101L3.33301 28.0513ZM7.32634 21.658H26.991V5.00865H5.00834V24.0683L7.32634 21.658Z" />
    </svg>
  );
}
