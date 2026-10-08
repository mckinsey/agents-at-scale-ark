import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function PromptSuggestion({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M606 -192L555 -243L678 -366H312C265.33 -366 225.67 -382.33 193 -415C160.33 -447.67 144 -487.33 144 -534C144 -580.67 160.33 -620.33 193 -653C225.67 -685.67 265.33 -702 312 -702H336V-630H312C285.12 -630 262.4 -620.74 243.84 -602.23C225.28 -583.71 216 -561.04 216 -534.23C216 -507.41 225.28 -484.67 243.84 -466C262.4 -447.33 285.12 -438 312 -438H678L555 -561L606 -612L816 -402L606 -192Z" />
    </svg>
  );
}
