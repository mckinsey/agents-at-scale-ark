'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';
import {
  Input,
  type InputProps,
  inputSizeDefinitions,
  inputVariantStyles,
} from './input';
import { Textarea } from './textarea';

// Focus state wrapper styles for default variant
// Triggered by child input focus-visible OR data-open="true" on the wrapper
const defaultFocusStyles = [
  'has-[[data-slot=input-group-control]:focus-visible]:bg-stateslayer-overlay-active-inverse',
  'has-[[data-slot=input-group-control]:focus-visible]:ring-stroke-status-focus',
  'has-[[data-slot=input-group-control]:focus-visible]:shadow-elevation-0',
  'data-[open=true]:bg-stateslayer-overlay-active-inverse',
  'data-[open=true]:ring-stroke-status-focus',
  'data-[open=true]:shadow-elevation-0',
] as const;

// Per-size focus ring width for InputGroup default variant
const inputGroupFocusRingWidth = {
  sm: 'has-[[data-slot=input-group-control]:focus-visible]:ring-[1px] data-[open=true]:ring-[1px]',
  default:
    'has-[[data-slot=input-group-control]:focus-visible]:ring-[1px] data-[open=true]:ring-[1px]',
  lg: 'has-[[data-slot=input-group-control]:focus-visible]:ring-[2px] data-[open=true]:ring-[2px]',
} as const;

// Focus state wrapper styles for inline variant
// Triggered by child input focus-visible OR data-open="true" on the wrapper
const inlineFocusStyles = [
  'has-[[data-slot=input-group-control]:focus-visible]:border-b-stroke-status-focus',
  'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
  'has-[[data-slot=input-group-control]:focus-visible]:shadow-elevation-0',
  'data-[open=true]:border-b-stroke-status-focus',
  'data-[open=true]:ring-0',
  'data-[open=true]:shadow-elevation-0',
] as const;

// Per-size focus border-bottom width for InputGroup inline variant
const inputGroupInlineFocusBorderWidth = {
  sm: 'has-[[data-slot=input-group-control]:focus-visible]:border-b-[1px] data-[open=true]:border-b-[1px]',
  default:
    'has-[[data-slot=input-group-control]:focus-visible]:border-b-[1px] data-[open=true]:border-b-[1px]',
  lg: 'has-[[data-slot=input-group-control]:focus-visible]:border-b-[2px] data-[open=true]:border-b-[2px]',
} as const;

// Error state wrapper styles for default variant
const defaultErrorStyles = [
  'has-[[data-slot][aria-invalid=true]]:!border',
  'has-[[data-slot][aria-invalid=true]]:border-status-error',
  'has-[[data-slot][aria-invalid=true]]:ring-0',
] as const;

// Error state wrapper styles for inline variant
const inlineErrorStyles = [
  'has-[[data-slot][aria-invalid=true]]:!border-b',
  'has-[[data-slot][aria-invalid=true]]:border-b-status-error',
  'has-[[data-slot][aria-invalid=true]]:ring-0',
] as const;

const inputGroupVariants = cva(
  'group/input-group relative flex w-full items-center rounded-none border-0 transition-[background-color,box-shadow,border-color] outline-none min-w-0 has-[>textarea]:h-auto',
  {
    variants: {
      variant: {
        default: [
          'gap-1',
          inputVariantStyles.default.base,
          inputVariantStyles.default.hover,
          ...defaultFocusStyles,
          ...defaultErrorStyles,
        ],
        inline: [
          'gap-2 px-0!',
          inputVariantStyles.inline.base,
          inputVariantStyles.inline.border,
          inputVariantStyles.inline.hover,
          ...inlineFocusStyles,
          ...inlineErrorStyles,
        ],
      },
      size: {
        sm: `${inputSizeDefinitions.sm} gap-1 pl-2 pr-2`,
        default: `${inputSizeDefinitions.default} gap-2 pl-2 pr-2`,
        lg: `${inputSizeDefinitions.lg} gap-2 pl-3 pr-3`,
      },
    },
    compoundVariants: [
      {
        variant: 'default',
        size: 'sm',
        className: inputGroupFocusRingWidth.sm,
      },
      {
        variant: 'default',
        size: 'default',
        className: inputGroupFocusRingWidth.default,
      },
      {
        variant: 'default',
        size: 'lg',
        className: inputGroupFocusRingWidth.lg,
      },
      {
        variant: 'inline',
        size: 'sm',
        className: inputGroupInlineFocusBorderWidth.sm,
      },
      {
        variant: 'inline',
        size: 'default',
        className: inputGroupInlineFocusBorderWidth.default,
      },
      {
        variant: 'inline',
        size: 'lg',
        className: inputGroupInlineFocusBorderWidth.lg,
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface InputGroupProps
  extends
    React.ComponentProps<'div'>,
    VariantProps<typeof inputGroupVariants> {}

function InputGroup({ className, variant, size, ...props }: InputGroupProps) {
  return (
    <div
      data-slot="input-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        inputGroupVariants({ variant, size }),
        // Variants based on alignment.
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "text-fg-secondary flex h-auto cursor-text items-center justify-center gap-2 py-1 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50",
  {
    variants: {
      align: {
        'inline-start': 'order-first',
        'inline-end': 'order-last',
        'block-start':
          'order-first w-full justify-start px-2 pt-2 [.border-b]:pb-2 group-has-[>input]/input-group:pt-1.5',
        'block-end':
          'order-last w-full justify-start px-2 pb-2 [.border-t]:pt-2 group-has-[>input]/input-group:pb-1.5',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }

        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva(
  'text-sm shadow-none flex gap-2 items-center',
  {
    variants: {
      size: {
        xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
        sm: 'h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5',
        // Icon button sizes per Figma design:
        // icon-xxs: 16px
        // icon-xs: 20px (sm & default input groups)
        // icon-sm: 24px (large input groups)
        'icon-xxs':
          'size-4 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
        'icon-xs':
          'size-5 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
        'icon-sm':
          'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
      },
    },
    defaultVariants: {
      size: 'xs',
    },
  },
);

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "text-fg-secondary flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  variant,
  size,
  ...props
}: Readonly<InputProps>) {
  const isInline = variant === 'inline';

  // Common base styles for all variants
  const baseStyles = 'flex-1';

  // Default variant: remove input's own styling since wrapper provides it
  const defaultVariantStyles = [
    'h-full rounded-none border-0 bg-transparent',
    'px-0! py-0!',
    '!shadow-none [box-shadow:none]',
    // Focus state
    'focus-visible:bg-transparent focus-visible:ring-0',
    'focus-visible:!shadow-none focus-visible:[box-shadow:none]',
    // Hover state
    'hover:bg-transparent hover:!shadow-none',
    // Error state
    'aria-invalid:bg-transparent aria-invalid:ring-0 aria-invalid:!shadow-none',
  ];

  // Inline variant: remove all borders and shadows since wrapper provides them
  const inlineVariantStyles = [
    'px-0! py-0!',
    '!border-0',
    'hover:!border-0',
    'focus-visible:!border-0 focus-visible:!mb-0',
    'focus-visible:!shadow-none focus-visible:[box-shadow:none]',
    'aria-invalid:!border-0',
  ];

  return (
    <Input
      data-slot="input-group-control"
      variant={variant}
      size={size}
      className={cn(
        baseStyles,
        isInline ? inlineVariantStyles : defaultVariantStyles,
        className,
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        // Remove textarea's own styling since the wrapper provides it
        'h-full flex-1 resize-none rounded-none border-0 bg-transparent px-2 py-2 !shadow-none [box-shadow:none]',
        'focus-visible:bg-transparent focus-visible:!shadow-none focus-visible:ring-0 focus-visible:[box-shadow:none]',
        'hover:bg-transparent hover:!shadow-none',
        'aria-invalid:bg-transparent aria-invalid:!shadow-none aria-invalid:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
  inputGroupVariants,
};
