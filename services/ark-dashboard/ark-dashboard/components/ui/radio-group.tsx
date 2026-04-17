'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as React from 'react';

import { cn } from '../../lib/utils';

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item> & {
  size?: 'default' | 'lg';
}) {
  const isLg = size === 'lg';
  const bboxSize = isLg ? 'size-6' : 'size-5';
  const circleSize = isLg ? 'size-5' : 'size-4';
  const dotSize = isLg ? 'size-2.5' : 'size-2';

  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      data-size={size}
      className={cn(
        bboxSize,
        'group relative shrink-0 rounded-full outline-none',
        'flex items-center justify-center',
        'disabled:cursor-not-allowed',
        className,
      )}
      {...props}>
      <div
        className={cn(
          circleSize,
          'rounded-full border bg-transparent transition-colors',
          'border-stroke-primary',
          'ring-stroke-status-focus group-focus-visible:border-stroke-active group-focus-visible:ring-2',
          'group-disabled:border-stroke-tertiary',
        )}
      />

      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            dotSize,
            'bg-fill-active rounded-full',
            'group-disabled:bg-fill-disabled',
          )}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
