import * as React from 'react';

import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function ChatBubble({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M100-118.46V-860h760v600H241.54L100-118.46Zm121.69-186.93h592.92v-509.22H145.39v589.99l76.3-80.77Zm-76.3 0v-509.22 509.22Z" />
    </svg>
  );
}
