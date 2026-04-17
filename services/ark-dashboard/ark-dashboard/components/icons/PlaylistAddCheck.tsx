import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function PlaylistAddCheck({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      {...props}>
      <path d="M120-331v-60h306v60H120Zm0-165v-60h473v60H120Zm0-165v-60h473v60H120Zm532 460L516-337l42-43 94 93 185-185 43 43-228 228Z" />
    </svg>
  );
}
