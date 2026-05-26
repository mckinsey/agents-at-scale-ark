import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../../lib/utils';

// Edge case when type=search for input, there is a cancel button (X) that is styled to match the design system colors.
const searchCancelButtonIcon =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgNEw0IDEyTTQgNEwxMiAxMiIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=';

// Search input cancel button (X) styling - Clean icon with design system colors
const searchCancelButtonStyles = [
  '[&::-webkit-search-cancel-button]:appearance-none',
  '[&::-webkit-search-cancel-button]:size-4',
  '[&::-webkit-search-cancel-button]:cursor-pointer',
  '[&::-webkit-search-cancel-button]:rounded-full',
  '[&::-webkit-search-cancel-button]:bg-text-secondary',
  '[&::-webkit-search-cancel-button]:hover:bg-text-primary',
  '[&::-webkit-search-cancel-button]:transition-colors',
  `[&::-webkit-search-cancel-button]:[mask-image:url(${searchCancelButtonIcon})]`,
  '[&::-webkit-search-cancel-button]:[mask-size:contain]',
  '[&::-webkit-search-cancel-button]:[mask-repeat:no-repeat]',
  '[&::-webkit-search-cancel-button]:[mask-position:center]',
].join(' ');

// Shared input variant styles - exported for use in InputGroup
export const inputVariantStyles = {
  default: {
    base: 'border border-transparent bg-fill-onsurface-ui-3',
    text: 'text-fg-primary placeholder:text-fg-tertiary',
    hover: 'hover:bg-stateslayer-overlay-hover',
    focus:
      'focus-visible:bg-stateslayer-overlay-active-inverse focus-visible:ring-stroke-status-focus focus-visible:shadow-elevation-0',
    error: 'aria-invalid:border-status-error aria-invalid:ring-0',
    disabled:
      'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-stateslayer-overlay-disabled disabled:text-fg-disabled disabled:placeholder:text-fg-disabled',
  },
  inline: {
    base: 'bg-transparent border-0 border-b-[1px] shadow-none',
    border: 'border-b-stroke-tertiary',
    text: 'text-fg-primary placeholder:text-fg-tertiary',
    hover: 'hover:border-b-stroke-tertiary-hover',
    focus:
      'focus-visible:border-b-stroke-status-focus focus-visible:ring-0 focus-visible:shadow-elevation-0',
    error: 'aria-invalid:border-b-status-error aria-invalid:ring-0',
    disabled:
      'disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-fg-disabled disabled:placeholder:text-fg-disabled',
    autofill:
      'autofill:[-webkit-box-shadow:0_0_0_1000px_transparent_inset] autofill:[-webkit-text-fill-color:var(--color-fg-primary)] autofill:[transition:background-color_5000s_ease-in-out_0s]',
  },
} as const;

// Shared input size styles - exported for use in InputGroup
export const inputSizeStyles = {
  sm: 'h-7 paragraph-regular-primary',
  default: 'h-9 paragraph-regular-primary',
  lg: 'h-12 paragraph-large-primary',
} as const;

// Shared input size definitions with padding - exported for use in InputGroup
export const inputSizeDefinitions = {
  sm: `${inputSizeStyles.sm} px-2 py-1`,
  default: `${inputSizeStyles.default} p-2`,
  lg: `${inputSizeStyles.lg} p-3`,
} as const;

// Per-size focus ring/border width — lg uses 2px per Figma, sm/default use 1px
export const inputFocusRingWidth = {
  sm: 'focus-visible:ring-[1px]',
  default: 'focus-visible:ring-[1px]',
  lg: 'focus-visible:ring-[2px]',
} as const;

export const inputInlineFocusBorderWidth = {
  sm: 'focus-visible:border-b-[1px]',
  default: 'focus-visible:border-b-[1px]',
  lg: 'focus-visible:border-b-[2px]',
} as const;

const inputVariants = cva(
  // Base styles shared by all variants
  `flex w-full min-w-0 rounded-none outline-none transition-[border-color,box-shadow,background-color] font-normal ${searchCancelButtonStyles}`,
  {
    variants: {
      variant: {
        default: [
          // Base styles - matching QB-DS v2.0.0 Figma design (Input-Shell + State-Layer)
          inputVariantStyles.default.base,
          'px-2 py-1',
          // Text and placeholder colors from design system
          inputVariantStyles.default.text,
          // Selection styling
          'selection:bg-fill-active selection:text-fg-primary-inverse',
          // File input styling
          'file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-fg-primary',
          // Focus state - using border and subtle background change
          inputVariantStyles.default.focus,
          // Hover state - subtle background change
          inputVariantStyles.default.hover,
          // Invalid/error state - just red border, no background
          inputVariantStyles.default.error,
          // Disabled state
          inputVariantStyles.default.disabled,
        ],
        inline: [
          // Inline variant - transparent background with border-image for dynamic border
          inputVariantStyles.inline.base,
          'px-0 py-1',
          // Initial border - tertiary (1px)
          inputVariantStyles.inline.border,
          // Text colors - primary for text, tertiary for placeholder
          inputVariantStyles.inline.text,
          // Selection styling
          'selection:bg-fill-active selection:text-fg-primary-inverse',
          // Hover state - change border color (still 1px)
          inputVariantStyles.inline.hover,
          // Focus state - 2px focus color with margin adjustment to prevent shift
          inputVariantStyles.inline.focus,
          // Invalid/error state
          inputVariantStyles.inline.error,
          // Disabled state
          inputVariantStyles.inline.disabled,
          // Suppress Chrome/Safari autofill yellow/teal background
          inputVariantStyles.inline.autofill,
          'px-0!',
        ],
      },
      size: {
        sm: inputSizeDefinitions.sm,
        default: inputSizeDefinitions.default,
        lg: inputSizeDefinitions.lg,
      },
    },
    compoundVariants: [
      { variant: 'default', size: 'sm', className: inputFocusRingWidth.sm },
      {
        variant: 'default',
        size: 'default',
        className: inputFocusRingWidth.default,
      },
      { variant: 'default', size: 'lg', className: inputFocusRingWidth.lg },
      {
        variant: 'inline',
        size: 'sm',
        className: inputInlineFocusBorderWidth.sm,
      },
      {
        variant: 'inline',
        size: 'default',
        className: inputInlineFocusBorderWidth.default,
      },
      {
        variant: 'inline',
        size: 'lg',
        className: inputInlineFocusBorderWidth.lg,
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Input component props
 */
export interface InputProps
  extends
    Omit<React.ComponentProps<'input'>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * The visual style variant of the input.
   * - `default`: Standard input with background and border
   * - `inline`: Transparent background with only bottom border
   * @default "default"
   */
  variant?: 'default' | 'inline';
  /**
   * The size of the input.
   * - `sm`: Small (28px height)
   * - `default`: Default (36px height)
   * - `lg`: Large (40px height)
   * @default "default"
   */
  size?: 'sm' | 'default' | 'lg';
}

/**
 * Input component for single-line text entry.
 *
 * Supports text, email, password, search, and other input types.
 * Use with InputGroup for inputs with icons or addons.
 *
 * @example
 * ```tsx
 * <Input placeholder="Enter your email" type="email" />
 * <Input variant="inline" placeholder="Inline input" />
 * <Input size="lg" placeholder="Large input" />
 * ```
 */
function Input({ className, type, variant, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
