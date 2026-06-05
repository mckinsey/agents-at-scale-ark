import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ContentCopy({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M260.77-230.77V-860H770v629.23H260.77Zm45.38-45.39h418.46v-538.45H306.15v538.45ZM150-120v-616.92h45.39v571.53h451.53V-120H150Zm156.15-156.16v-538.45 538.45Z" />
    </svg>
  );
}
