import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * Padding lookup, keyed by content mode → size.
 * Keeps padding rules in one flat map instead of a combinatorial compound matrix.
 */
const badgePadding = {
  'icon-rect': { sm: 'pl-1 pr-2', default: 'pl-1 pr-2', lg: 'pl-1 pr-2' },
  'icon-pill': { sm: 'pl-1 pr-2', default: 'pl-1 pr-2', lg: 'pl-1 pr-2' },
  'dot-rect': { sm: 'pl-1 pr-2', default: 'pl-1 pr-2', lg: 'pl-2 pr-3' },
  'dot-pill': { sm: 'pl-1 pr-2', default: 'px-2', lg: 'pl-2 pr-3' },
  'label-rect': { sm: 'px-1', default: 'px-2', lg: 'px-2' },
  'label-pill': { sm: 'px-2', default: 'px-2', lg: 'px-2' },
} as const;

function getBadgePadding(
  size: 'sm' | 'default' | 'lg',
  format: 'pill' | 'rect',
  withIcon: boolean,
  withDot: boolean,
) {
  const mode = withIcon ? 'icon' : withDot ? 'dot' : 'label';
  return badgePadding[`${mode}-${format}`][size];
}

const badgeVariants = cva(
  'inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:size-4 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        'high-emphasis': 'bg-fill-active text-fg-primary-inverse',
        'brand-accent': 'bg-brand-accents-qb-accent text-mist-50',
        alternative: 'bg-fill-muted text-fg-secondary',
        error: 'bg-status-error text-fg-primary-inverse',
        warning: 'bg-status-warning text-fg-primary-inverse',
        success: 'bg-status-success text-fg-primary-inverse',
      },
      format: {
        pill: 'rounded-full',
        rect: 'rounded-[4px]',
      },
      size: {
        sm: 'h-5 label-small-primary min-w-5',
        default: 'h-6 label-small-primary min-w-6',
        lg: 'h-7 label-regular-primary min-w-7',
      },
      outline: {
        true: 'bg-fill-active-inverse text-fg-primary outline outline-solid outline-1',
      },
    },
    compoundVariants: [
      {
        variant: 'high-emphasis',
        outline: true,
        className: 'outline-stroke-primary',
      },
      {
        variant: 'brand-accent',
        outline: true,
        className: 'outline-brand-accents-qb-accent',
      },
      {
        variant: 'alternative',
        outline: true,
        className: 'outline-stroke-secondary text-fg-secondary bg-fill-muted',
      },
      {
        variant: 'error',
        outline: true,
        className: 'outline-stroke-status-error',
      },
      {
        variant: 'warning',
        outline: true,
        className: 'outline-stroke-status-warning',
      },
      {
        variant: 'success',
        outline: true,
        className: 'outline-stroke-status-success',
      },
      {
        outline: true,
        size: 'sm',
        className: 'outline-[0.5px]',
      },
    ],
    defaultVariants: {
      variant: 'high-emphasis',
      format: 'rect',
      size: 'default',
      outline: false,
    },
  },
);

export type BadgeProps = Omit<
  React.ComponentProps<'span'>,
  keyof VariantProps<typeof badgeVariants>
> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Adjusts padding for a leading icon. @default false */
    withIcon?: boolean;
    /** Adjusts padding for a leading status dot. @default false */
    withDot?: boolean;
  };

function Badge({
  className,
  variant,
  format = 'rect',
  size = 'default',
  outline,
  withIcon = false,
  withDot = false,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  const resolvedSize = size ?? 'default';
  const resolvedFormat = format ?? 'rect';

  return (
    <Comp
      data-slot="badge"
      className={cn(
        badgeVariants({ variant, format, size, outline }),
        getBadgePadding(resolvedSize, resolvedFormat, withIcon, withDot),
        withIcon && resolvedSize === 'sm' && !outline && 'gap-0.5',
        className,
      )}
      {...props}
    />
  );
}

const numericBadgeVariants = cva(
  'shadow-elevation-0 rounded-full outline outline-solid',
  {
    variants: {
      variant: {
        primary: 'bg-fill-active  text-fg-primary-inverse',
        secondary: 'bg-fill-muted text-fg-primary',
        accent: 'bg-brand-accents-qb-accent text-fg-primary-inverse',
      },
      size: {
        sm: 'h-4 min-w-4 px-0.5 paragraph-small-emphasised outline-1',
        default: 'h-5 min-w-5 px-1 paragraph-regular-emphasised-600 outline-1',
        lg: 'h-6 min-w-6 px-1 paragraph-regular-emphasised-600 outline-2',
      },
      outline: {
        false: 'outline-stroke-active-inverse',
        true: 'bg-fill-primary-inverse text-fg-primary',
      },
    },
    compoundVariants: [
      {
        variant: 'primary',
        outline: true,
        className: 'outline-stroke-active',
      },
      {
        variant: 'secondary',
        outline: true,
        className: 'outline-stroke-tertiary',
      },
      {
        variant: 'accent',
        outline: true,
        className: 'outline-brand-accents-qb-accent',
      },
      {
        outline: true,
        size: 'default',
        className: 'outline-2',
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      outline: false,
    },
  },
);

type NumericBadgeProps = Omit<
  React.ComponentProps<typeof Badge>,
  'variant' | 'format' | 'size' | 'outline'
> & {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'sm' | 'default' | 'lg';
  outline?: boolean;
};

function NumericBadge({
  className,
  variant = 'primary',
  size = 'default',
  outline = false,
  ...props
}: NumericBadgeProps) {
  return (
    <Badge
      outline={outline}
      className={cn(
        numericBadgeVariants({ variant, size, outline }),
        className,
      )}
      {...props}
    />
  );
}

/**
 * Outer frame: 8 / 12 / 16 / 20px; centers the dot (ring wrapping core) inside.
 */
const statusBadgeRootVariants = cva(
  'box-border inline-flex shrink-0 items-center justify-center rounded-full',
  {
    variants: {
      size: {
        sm: 'size-2',
        default: 'size-3',
        lg: 'size-4',
        xl: 'size-5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

type StatusBadgeDotVariant =
  | 'neutral'
  | 'neutral-brand'
  | 'error'
  | 'warning'
  | 'success';

type StatusBadgeDotSize = 'sm' | 'default' | 'lg' | 'xl';

/**
 * Inner dot core. `variant` sets filled **bg**; when `outline`, `outline` slot adds transparent fill +
 * inset outline stroke (merge via `cn()` so `bg-transparent` wins over variant `bg-*`).
 */
const statusBadgeCoreVariants = cva('box-content shrink-0 rounded-full', {
  variants: {
    variant: {
      neutral: 'bg-fill-active',
      'neutral-brand': 'bg-brand-accents-qb-accent',
      error: 'bg-status-error',
      warning: 'bg-status-warning',
      success: 'bg-status-success',
    },
    size: {
      sm: 'size-1.5',
      default: 'size-2',
      lg: 'size-3',
      xl: 'size-4',
    },
    outline: {
      false: 'border-0',
      true: 'border-0 bg-transparent outline outline-solid outline-1 outline-offset-[-1px]',
    },
  },
  compoundVariants: [
    {
      outline: true,
      size: 'lg',
      className: 'outline-2 outline-offset-[-2px]',
    },
    {
      outline: true,
      size: 'xl',
      className: 'outline-2 outline-offset-[-2px]',
    },
    {
      outline: true,
      variant: 'neutral',
      className: 'outline-stroke-active',
    },
    {
      outline: true,
      variant: 'neutral-brand',
      className: 'outline-stroke-status-focus',
    },
    {
      outline: true,
      variant: 'error',
      className: 'outline-stroke-status-error',
    },
    {
      outline: true,
      variant: 'warning',
      className: 'outline-stroke-status-warning',
    },
    {
      outline: true,
      variant: 'success',
      className: 'outline-stroke-status-success',
    },
  ],
  defaultVariants: {
    variant: 'neutral',
    size: 'default',
    outline: false,
  },
});

/**
 * Outer ring span: **always** the contrast stroke (`border-stroke-active-inverse` + width from size).
 * Flex-centers the core; same content size as the core so they stack without absolute positioning.
 */
const statusBadgeRingVariants = cva(
  'border-stroke-active-inverse box-content inline-flex shrink-0 items-center justify-center rounded-full border-solid',
  {
    variants: {
      size: {
        sm: 'size-1.5 border',
        default: 'size-2 border',
        lg: 'size-3 border-2',
        xl: 'size-4 border-2',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

type StatusBadgeProps = Omit<React.ComponentProps<'span'>, 'variant'> & {
  variant?: StatusBadgeDotVariant;
  size?: StatusBadgeDotSize;
  outline?: boolean;
};

/**
 * Hint-Dot: outer ring always bordered; inner is fill OR semantic border per `outline`.
 */
function StatusBadge({
  className,
  variant = 'neutral',
  size = 'default',
  outline = false,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeRootVariants({ size }), className)}
      {...props}>
      <span className={statusBadgeRingVariants({ size })}>
        <span
          className={cn(statusBadgeCoreVariants({ variant, size, outline }))}
        />
      </span>
    </span>
  );
}

export {
  Badge,
  NumericBadge,
  StatusBadge,
  badgeVariants,
  numericBadgeVariants,
  statusBadgeCoreVariants,
  statusBadgeRingVariants,
  statusBadgeRootVariants,
};
