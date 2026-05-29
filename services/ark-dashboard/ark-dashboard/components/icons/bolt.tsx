import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Bolt({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="m400.69-183.08 259.77-311.53H485.85l34.07-270.23-234.53 339.45h149.76l-34.46 242.31Zm-57.61 80.77 40-277.69h-185l329.61-475.77h49.23L537.31-540H757.3L392.31-102.31h-49.23Zm130.15-372.15Z" />
    </svg>
  );
}
