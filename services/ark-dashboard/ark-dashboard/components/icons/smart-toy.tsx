import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function SmartToy({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M170.46-391.77q-38.07 0-64.27-26.4Q80-444.57 80-482.23q0-37.66 26.4-64.06 26.4-26.4 64.06-26.4v-176.85h219.08q0-37.66 26.19-64.06Q441.92-840 480-840t64.27 26.4q26.19 26.4 26.19 64.06h219.08v176.85q37.66 0 64.06 26.4 26.4 26.4 26.4 64.06 0 37.66-26.4 64.06-26.4 26.4-64.06 26.4V-140H170.46v-251.77Zm202.39-95Q383-497.16 383-512q0-14.85-10.39-25t-25.23-10.15q-14.84 0-24.99 10.39-10.16 10.38-10.16 25.23 0 14.84 10.39 24.99 10.39 10.16 25.23 10.16t25-10.39Zm264.76 0q10.16-10.39 10.16-25.23 0-14.85-10.39-25t-25.23-10.15q-14.84 0-25 10.39Q577-526.38 577-511.53q0 14.84 10.39 24.99 10.39 10.16 25.23 10.16t24.99-10.39Zm-313.3 192.92h311.38v-45.38H324.31v45.38ZM215.85-185.39h528.3v-518.76h-528.3v518.76ZM480-445.08Z" />
    </svg>
  );
}
