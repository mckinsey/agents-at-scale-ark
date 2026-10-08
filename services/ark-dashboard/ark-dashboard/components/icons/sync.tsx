import * as React from 'react';

import { cn } from '@/lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly className?: string;
}

export function Sync({ className, ...props }: Readonly<IconProps>) {
  return (
    <svg
      className={cn('size-full', className)}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}>
      <path d="M216 -192V-264H290C260 -290.67 236.17 -322.5 218.5 -359.5C200.83 -396.5 192 -436.67 192 -480C192 -547.33 212.33 -606.5 253 -657.5C293.67 -708.5 345.33 -742 408 -758V-683C366 -667.67 331.5 -641.83 304.5 -605.5C277.5 -569.17 264 -527.33 264 -480C264 -448 270.5 -418.33 283.5 -391C296.5 -363.67 314 -340.33 336 -321V-384H408V-192H216ZM552 -202V-277C594 -292.33 628.5 -318.17 655.5 -354.5C682.5 -390.83 696 -432.67 696 -480C696 -512 689.5 -541.67 676.5 -569C663.5 -596.33 646 -619.67 624 -639V-576H552V-768H744V-696H670C700 -669.33 723.83 -637.5 741.5 -600.5C759.17 -563.5 768 -523.33 768 -480C768 -412.67 747.67 -353.5 707 -302.5C666.33 -251.5 614.67 -218 552 -202Z" />
    </svg>
  );
}
