import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function InsertDriveFile({
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
      <path d="M180-100v-760h405.23L780-665.23V-100H180Zm382.54-544.77v-169.84H225.39v669.22h509.22v-499.38H562.54ZM225.39-814.61v169.84-169.84 669.22-669.22Z" />
    </svg>
  );
}
