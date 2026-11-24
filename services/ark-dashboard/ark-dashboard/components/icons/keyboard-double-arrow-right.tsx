import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function KeyboardDoubleArrowRight({
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
      <path d="M422.54-480.62 228.39-675.15l32-31.62 226.15 226.15-226.15 226.16-32-32 194.15-194.16Zm246.08 0L474.46-675.15l31.62-31.62 226.15 226.15-226.15 226.16-31.62-32 194.16-194.16Z" />
    </svg>
  );
}
