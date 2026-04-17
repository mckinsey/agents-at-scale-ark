import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const iconVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center',
    '[&_svg]:fill-current [&_svg]:stroke-current',
  ],
  {
    variants: {
      size: {
        sm: 'text-[16px] size-4',
        default: 'text-[24px] size-6',
        lg: 'text-[32px] size-8',
      },
      variant: {
        primary: 'opacity-88',
        secondary: 'opacity-60',
        disabled: 'opacity-30',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'primary',
    },
  },
);

function IconShell({
  className,
  size,
  variant,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof iconVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="icon"
      className={cn(iconVariants({ size, variant }), className)}
      {...props}>
      {children}
    </Comp>
  );
}

export { IconShell, iconVariants };
