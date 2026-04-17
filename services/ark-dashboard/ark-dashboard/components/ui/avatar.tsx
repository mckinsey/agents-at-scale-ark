'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

// Context to share size and disabled state with children
type AvatarContextValue = {
  size?: 'xxs' | 'xs' | 'sm' | 'default' | 'lg' | 'xl';
  disabled?: boolean;
};

const AvatarContext = React.createContext<AvatarContextValue>({});

const useAvatarContext = () => React.useContext(AvatarContext);

// Avatar styles based on Figma design
const avatarVariants = cva(
  [
    // Base layout and positioning
    'relative flex shrink-0 rounded-full shadow-elevation-0 hover:shadow-elevation-1',
    'transition-all duration-200',
  ].join(' '),
  {
    variants: {
      size: {
        xxs: 'size-5',
        xs: 'size-6',
        sm: 'size-7',
        default: 'size-9',
        lg: 'size-12',
        xl: 'size-16',
      },
      // State: Enable (default)
      state: {
        default: [
          'bg-fill-onsurface-ui-2',
          'border border-stroke-active-inverse',
        ],
        disabled: [
          'bg-stateslayer-overlay-disabled border border-stroke-active-inverse',
        ],
      },
    },
    compoundVariants: [
      // Small size has 1px border, others have 2px
      {
        size: ['default', 'lg', 'xl'],
        state: ['default', 'disabled'],
        class: 'border-2',
      },
      // Overlay pseudo-element - Only for enabled state
      // Base setup: positioned absolutely to cover the entire avatar (including border)
      {
        state: 'default',
        class: [
          'before:absolute before:inset-0 before:rounded-full',
          'before:pointer-events-none before:z-10',
          'before:transition-opacity before:duration-200',
          // Default state (hidden): uses hover color but opacity-0 keeps it hidden
          'before:bg-stateslayer-overlay-hover before:opacity-0',
          // Hover state: show the hover overlay (opacity becomes 100)
          'hover:before:opacity-100',
          // Active state: change to pressed color and show overlay
          'active:before:bg-stateslayer-overlay-pressed active:before:opacity-100',
        ].join(' '),
      },
      // Overlay positioning to cover border - 1px border for small sizes (enabled only)
      {
        size: ['xxs', 'xs', 'sm'],
        state: 'default',
        class: 'before:-inset-px',
      },
      // Overlay positioning to cover border - 2px border for larger sizes (enabled only)
      {
        size: ['default', 'lg', 'xl'],
        state: 'default',
        class: 'before:-inset-[2px]',
      },
    ],
    defaultVariants: {
      size: 'default',
      state: 'default',
    },
  },
);

const avatarFallbackVariants = cva(
  'flex size-full items-center justify-center rounded-full font-semibold text-fg-primary',
  {
    variants: {
      size: {
        xxs: 'text-xs leading-4',
        xs: 'text-xs leading-4',
        sm: 'text-xs leading-4',
        default: 'text-sm leading-5',
        lg: 'text-base leading-6',
        xl: 'text-2xl leading-7',
      },
      disabled: {
        true: 'text-fg-disabled',
      },
    },
    defaultVariants: {
      size: 'default',
      disabled: false,
    },
  },
);

export interface AvatarProps
  extends
    React.ComponentProps<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {
  disabled?: boolean;
}

function Avatar({
  className,
  size,
  disabled,
  children,
  ...props
}: AvatarProps) {
  return (
    <AvatarContext.Provider
      value={{ size: size ?? undefined, disabled: disabled ?? undefined }}>
      <AvatarPrimitive.Root
        data-slot="avatar"
        tabIndex={disabled ? -1 : 0}
        className={cn(
          avatarVariants({
            size,
            state: disabled ? 'disabled' : 'default',
          }),
          // Focus state - only enabled when not disabled; 1px for small sizes, 2px for default/lg/xl (Figma)
          !disabled && 'ring-stroke-focus-brand',
          !disabled &&
            (size === 'xxs' || size === 'xs' || size === 'sm'
              ? 'focus-visible:ring-[1px]'
              : 'focus-visible:ring-2'),
          // Disabled cursor
          disabled && 'cursor-not-allowed',
          className,
        )}
        {...props}>
        {children}
      </AvatarPrimitive.Root>
    </AvatarContext.Provider>
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      className={cn(
        'aspect-square size-full rounded-full object-cover',
        className,
      )}
      data-slot="avatar-image"
      {...props}
    />
  );
}

export interface AvatarFallbackProps
  extends
    React.ComponentProps<typeof AvatarPrimitive.Fallback>,
    VariantProps<typeof avatarFallbackVariants> {
  disabled?: boolean;
}

function AvatarFallback({
  className,
  disabled: disabledProp,
  size: sizeProp,
  ...props
}: AvatarFallbackProps) {
  const context = useAvatarContext();
  const size = sizeProp !== undefined ? sizeProp : context.size;
  const disabled = disabledProp !== undefined ? disabledProp : context.disabled;

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(avatarFallbackVariants({ size, disabled }), className)}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        '*:data-[slot=avatar]:ring-background group/avatar-group flex items-center -space-x-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn('text-fg-primary ml-3 font-semibold underline', className)}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount };
