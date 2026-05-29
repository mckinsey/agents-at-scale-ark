import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Edit({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M185.39-185.39h40.92l468.54-467.92-40.93-40.92-468.53 467.92v40.92ZM140-140v-104.54l593.54-593.69 105.69 105.31L244.54-140H140Zm634-593.92L734.54-773 774-733.92Zm-99.37 60.29-20.71-20.6 40.93 40.92-20.22-20.32Z" />
    </svg>
  );
}
