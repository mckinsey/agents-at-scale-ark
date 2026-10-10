import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function KeyboardDoubleArrowLeft({
  className,
  ...props
}: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M454.54-254.46 228.39-480.62l226.15-226.15 32 31.62L292-480.62l194.54 194.16-32 32Zm246.07 0L474.46-480.62l226.15-226.15 31.62 31.62-194.15 194.53 194.15 194.16-31.62 32Z" />
    </svg>
  );
}
