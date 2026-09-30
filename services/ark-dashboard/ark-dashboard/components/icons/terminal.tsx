import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Terminal({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M100-180V-780H860V-180H100ZM160-240H800V-640H160V-240ZM300-294.23L258.23-336L361.23-440L257.23-544L300-585.77L445.77-440L300-294.23ZM490-290V-350H710V-290H490Z" />
    </svg>
  );
}
