import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Warning({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M74.62-140 480-840l405.38 700H74.62Zm78.61-45.39h653.54L480-749.23 153.23-185.39Zm347.46-67.41q7.16-7.33 7.16-17.84t-7.34-17.67q-7.34-7.15-17.85-7.15-10.51 0-17.66 7.33-7.15 7.34-7.15 17.85 0 10.51 7.33 17.66 7.34 7.16 17.85 7.16 10.51 0 17.66-7.34Zm-40.54-90.58h45.39v-217.85h-45.39v217.85ZM480-467.31Z" />
    </svg>
  );
}
