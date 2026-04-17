'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as React from 'react';

import { cn } from '../../lib/utils';

function CheckmarkIcon({ size }: { size: 'default' | 'lg' }) {
  const isRegular = size === 'default';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        isRegular ? 'h-[7px] w-2' : 'h-[9px] w-[11px]',
        'group-data-[state=indeterminate]:hidden',
      )}
      viewBox={isRegular ? '0 0 8 7' : '0 0 11 9'}
      fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={
          isRegular
            ? 'M7.5 1.25L6.25 0L2.5 3.75L1.25 2.5L0 3.75L2.5 6.25L7.5 1.25Z'
            : 'M10.5 1.25L9.25 0L3.5 5.75L1.25 3.5L0 4.75L3.5 8.25L10.5 1.25Z'
        }
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Checkbox props with JSDoc for auto-generated documentation
 */
interface CheckboxProps extends React.ComponentProps<
  typeof CheckboxPrimitive.Root
> {
  /**
   * The size of the checkbox.
   * - `default`: 16px visible box (20px bounding box)
   * - `lg`: 20px visible box (24px bounding box)
   * @default "default"
   */
  size?: 'default' | 'lg';
  /**
   * The controlled checked state. Can be true, false, or "indeterminate".
   */
  checked?: boolean | 'indeterminate';
  /**
   * The default checked state for uncontrolled usage.
   */
  defaultChecked?: boolean | 'indeterminate';
}

/**
 * Checkbox component for binary or tri-state selection.
 *
 * Supports checked, unchecked, and indeterminate states.
 * Built on Radix UI Checkbox primitive for accessibility.
 *
 * @example
 * ```tsx
 * <Checkbox />
 * <Checkbox checked={true} />
 * <Checkbox checked="indeterminate" />
 * <Checkbox size="lg" />
 * ```
 */
function Checkbox({
  className,
  size = 'default',
  checked,
  defaultChecked,
  ...props
}: CheckboxProps) {
  const isRegular = size === 'default';
  const boundingBoxClass = isRegular ? 'size-5' : 'size-6';
  const visibleBoxClass = isRegular ? 'size-4' : 'size-5';
  const indicatorWidth = isRegular ? '8px' : '10px';

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        boundingBoxClass,
        'group peer relative flex shrink-0 items-center justify-center outline-none',
        'disabled:cursor-not-allowed',
        className,
      )}
      checked={checked}
      defaultChecked={defaultChecked}
      {...props}>
      <span
        data-slot="checkbox-visual"
        className={cn(
          visibleBoxClass,
          'relative flex items-center justify-center',
          'border-stroke-primary border bg-transparent',

          'group-focus-visible:ring-stroke-status-focus group-focus-visible:ring-2',
          'group-focus-visible:border-stroke-active',

          'group-disabled:border-stroke-tertiary',
          'group-disabled:group-data-[state=checked]:border-stroke-tertiary',
          'group-disabled:group-data-[state=indeterminate]:border-stroke-tertiary',
        )}>
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="text-fill-active group-disabled:text-fill-disabled absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-none">
          <CheckmarkIcon size={size} />

          <div
            className={cn(
              'bg-fill-active group-disabled:bg-fill-disabled h-0.5 group-data-[state=checked]:hidden',
            )}
            style={{ width: indicatorWidth }}
          />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
