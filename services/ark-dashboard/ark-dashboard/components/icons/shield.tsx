import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Shield({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M480-101.39q-130.38-35.77-215.19-155.19Q180-376 180-521.08v-225.69l300-112.31 300 112.31v225.69q0 145.08-84.81 264.5Q610.38-137.16 480-101.39Zm0-47.38Q591.92-185.23 663.27-289q71.34-103.77 71.34-232.08v-194.07L480-810.85l-254.61 95.7v194.07q0 128.31 71.34 232.08Q368.08-185.23 480-148.77Zm0-330.85Z" />
    </svg>
  );
}
