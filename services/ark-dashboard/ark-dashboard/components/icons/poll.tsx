import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Poll({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M296.51-288.51H346.77V-546.2H296.51V-288.51ZM454.87-288.51H505.13V-671.49H454.87V-288.51ZM613.23-288.51H663.49V-422.82H613.23V-288.51ZM140-140V-820H820V-140H140ZM190.26-190.26H769.74V-769.74H190.26V-190.26Z" />
    </svg>
  );
}
