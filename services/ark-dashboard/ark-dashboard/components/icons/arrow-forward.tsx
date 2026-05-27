import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ArrowForward({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M693.69-457.31H180v-45.38h513.69L448.39-748 480-780l300 300-300 300-31.61-32 245.3-245.31Z" />
    </svg>
  );
}
