import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function PlugConnect({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M295.39-180v-43.35H140v-233.96H60v-45.38h80v-233.39h155.39V-780h45.38v600h-45.38Zm-110-88.31h110v-422.38h-110v422.38ZM619.23-180v-158.08H449.62v-45.38h169.61v-192.46H449.62v-45.39h169.61V-780h45.38v43.92H820v233.39h80v45.38h-80v233.96H664.61V-180h-45.38Zm45.38-88.31h110v-422.38h-110v422.38ZM295.39-480Zm369.22 0Z" />
    </svg>
  );
}
