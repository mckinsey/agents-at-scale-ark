'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const labelVariants = cva(
  'flex items-center font-normal gap-1 select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
  {
    variants: {
      size: {
        sm: 'text-xs leading-4',
        default: 'text-sm leading-5 tracking-[-0.112px]',
        lg: 'text-base leading-6 tracking-[-0.128px]',
      },
      disabled: {
        false: 'text-fg-secondary',
        true: 'text-fg-disabled cursor-not-allowed',
      },
    },
    defaultVariants: {
      disabled: false,
      size: 'default',
    },
  },
);

export interface LabelProps
  extends
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

function Label({ className, size, disabled, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn(labelVariants({ size, disabled }), className)}
      data-slot="label"
      {...props}
    />
  );
}

export { Label, labelVariants };
