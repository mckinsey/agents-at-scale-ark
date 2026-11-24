import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function SwapVert({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M338.39-461.15v-312.54L212-646.92l-32-32L361.08-860l181.07 181.08-32 32-126.38-126.77v312.54h-45.38ZM598.54-100 417.46-281.08l32-32 126.39 126.77v-312.54h45.38v312.54L748-313.08l31.61 32L598.54-100Z" />
    </svg>
  );
}
