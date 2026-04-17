'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const switchVariants = cva(
  [
    'group inline-flex shrink-0 items-center relative',
    'border border-stroke-secondary data-[state=checked]:border-stroke-primary-inverse',
    'transition-all',
    'bg-fill-muted data-[state=checked]:bg-fill-primary',
    'focus-visible:outline-[2px] focus-visible:outline-stroke-status-focus',
    'focus-visible:border-stroke-active',
    'data-[state=checked]:focus-visible:border-stroke-active-inverse data-[state=checked]:focus-visible:bg-fill-active',
    'disabled:cursor-not-allowed',
    'disabled:border-stroke-tertiary disabled:data-[state=checked]:border-stroke-tertiary',
    'disabled:data-[state=checked]:bg-fill-muted',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'w-6 h-3 rounded-full border-[0.5px]',
        default: 'w-8 h-4 rounded-full border',
        lg: 'w-10 h-5 rounded-full border',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const switchThumbVariants = cva(
  [
    'block pointer-events-none rounded-full',
    'bg-fill-secondary data-[state=checked]:bg-fill-active-inverse',
    'data-[state=unchecked]:translate-x-0.5',
    'ring-0 transition-transform',
    'data-disabled:bg-fill-disabled data-disabled:cursor-not-allowed data-disabled:data-[state=checked]:bg-fill-disabled',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'size-2 data-[state=checked]:translate-x-3.5',
        default: 'size-2.5 data-[state=checked]:translate-x-4.75',
        lg: 'size-3.5 data-[state=checked]:translate-x-5.75',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

/**
 * Component to render a switch
 * @param className - The class name to apply to the switch
 * @param size - The size of the switch: 'sm', 'default', or 'lg'
 * @param props - Additional props to pass to the switch
 * @returns A React component
 */
function Switch({
  className,
  size,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size }), className)}
      {...props}>
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(switchThumbVariants({ size }))}
      />
      {size === 'lg' && (
        <span
          className={cn(
            'block size-1 rounded-full',
            'absolute top-1/2 right-1 -translate-y-1/2',
            'border-stroke-secondary border-[0.5px]',
            'group-data-[state=checked]:hidden',
            'group-focus-visible:border-stroke-active',
            'group-disabled:border-stroke-tertiary',
          )}
        />
      )}
    </SwitchPrimitive.Root>
  );
}

export { Switch, switchVariants };
