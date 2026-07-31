import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Lock({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M180-100v-515.54h127.31v-91.77q0-71.89 50.44-122.29Q408.19-880 480.13-880q71.95 0 122.25 50.4 50.31 50.4 50.31 122.29v91.77H780V-100H180Zm45.39-45.39h509.22v-424.76H225.39v424.76Zm302.57-164.14q19.81-19.53 19.81-47.01 0-26.54-19.98-47.77-19.97-21.23-47.96-21.23-27.98 0-47.79 21.23t-19.81 48.27q0 27.04 19.98 46.54 19.97 19.5 47.96 19.5 27.98 0 47.79-19.53ZM352.69-615.54h254.62v-91.77q0-53.04-37.09-90.17t-90.08-37.13q-52.99 0-90.22 37.13t-37.23 90.17v91.77Zm-127.3 470.15v-424.76 424.76Z" />
    </svg>
  );
}
