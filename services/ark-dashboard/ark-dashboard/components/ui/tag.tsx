import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Close } from '../icons/close';

const hoverOverlay = {
  normal:
    'hover:[background-image:linear-gradient(var(--color-stateslayer-overlay-hover),var(--color-stateslayer-overlay-hover))]',
  inverse:
    'hover:[background-image:linear-gradient(var(--color-stateslayer-overlay-hover-inverse),var(--color-stateslayer-overlay-hover-inverse))]!',
} as const;

const pressedOverlay = {
  normal:
    'active:[background-image:linear-gradient(var(--color-stateslayer-overlay-pressed),var(--color-stateslayer-overlay-pressed))]',
  inverse:
    'active:[background-image:linear-gradient(var(--color-stateslayer-overlay-pressed-inverse),var(--color-stateslayer-overlay-pressed-inverse))]!',
} as const;

const disabledOverlay =
  'aria-disabled:[background-image:linear-gradient(var(--color-stateslayer-overlay-disabled),var(--color-stateslayer-overlay-disabled))]';
const disabledOverlayInverse =
  'aria-disabled:[background-image:linear-gradient(var(--color-stateslayer-overlay-disabled-inverse),var(--color-stateslayer-overlay-disabled-inverse))]';

const dismissIconColor = {
  primary: 'text-fill-active',
  secondary: 'text-fill-active-inverse',
  accent: 'text-mist-50',
  outline: 'text-fill-active',
  'accent-outline': 'text-fill-active',
} as const;

/** Base interaction classes shared with TagToggle (parameterised by disabled prefix) */
function tagBaseStyles(disabledPrefix: 'disabled' | 'aria-disabled') {
  return [
    'whitespace-nowrap outline-none transition-all',
    `hover:underline [text-underline-position:from-font] ${disabledPrefix}:no-underline`,
    'focus-visible:ring-2 focus-visible:ring-stroke-status-focus',
    `${disabledPrefix}:cursor-not-allowed`,
    `${disabledPrefix}:hover:[background-image:none]`,
    `${disabledPrefix}:active:[background-image:none]`,
  ];
}

/** Size & pill classes shared with TagToggle */
const tagSizeVariants = cva('inline-flex items-center w-fit px-1 gap-1', {
  variants: {
    size: {
      xs: 'h-5 label-small-primary hover:tracking-[0.024px]',
      sm: 'h-6 label-regular-primary hover:tracking-[-0.028px]',
      default: 'h-7 label-regular-primary hover:tracking-[-0.028px]',
      lg: 'h-8 label-large-primary hover:tracking-[-0.032px]',
    },
    pill: {
      false: 'rounded-none !px-1',
      true: 'rounded-full px-2',
    },
  },
  compoundVariants: [{ pill: true, size: 'xs', class: 'px-1' }],
  defaultVariants: {
    size: 'default',
    pill: false,
  },
});

/** Full Tag variant styling (not shared — Tag is a <div>, Toggle is a <button>) */
const tagVariants = cva(tagBaseStyles('aria-disabled'), {
  variants: {
    variant: {
      primary: [
        'bg-fill-muted text-fg-primary',
        hoverOverlay.normal,
        pressedOverlay.normal,
        'aria-disabled:bg-fill-muted aria-disabled:text-fg-disabled',
        disabledOverlay,
      ],
      secondary: [
        'bg-fill-active text-fg-primary-inverse',
        hoverOverlay.inverse,
        pressedOverlay.inverse,
        'aria-disabled:text-fg-disabled-inverse',
        disabledOverlayInverse,
      ],
      accent: [
        'bg-brand-accents-qb-accent text-mist-50',
        hoverOverlay.inverse,
        pressedOverlay.inverse,
        'aria-disabled:text-fg-disabled',
        'aria-disabled:hover:[background-image:none]!',
        'aria-disabled:active:[background-image:none]!',
        disabledOverlay,
      ],
      outline: [
        'border border-stroke-secondary bg-fill-muted text-fg-primary',
        hoverOverlay.normal,
        pressedOverlay.normal,
        'aria-disabled:bg-fill-muted aria-disabled:text-fg-disabled',
        'aria-disabled:border-stroke-tertiary',
        disabledOverlay,
      ],

      'accent-outline': [
        'border border-brand-accents-qb-accent bg-fill-muted text-fg-primary',
        hoverOverlay.normal,
        pressedOverlay.inverse,
        'aria-disabled:bg-fill-muted aria-disabled:text-fg-disabled',
        'aria-disabled:active:[background-image:none]!',
        disabledOverlay,
      ],
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

/**
 * Tag props. Variant mapping to Figma (QB-DS v2.0.0 BETA):
 * - primary → Type=primary (muted fill) — default
 * - secondary → Type=high-emphasis (filled)
 * - accent → Type=accent
 * - outline → Type=primary, Outline=true
 * - accent-outline → Type=accent, Outline=true
 */
export interface TagProps
  extends
    React.ComponentProps<'div'>,
    VariantProps<typeof tagSizeVariants>,
    VariantProps<typeof tagVariants> {
  disabled?: boolean;
  onRemove?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function Tag({
  className,
  size = 'default',
  pill,
  variant = 'primary',
  onRemove,
  disabled,
  children,
  onClick,
  onKeyDown,
  ...props
}: TagProps) {
  const isInteractive = !!onClick;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);

    if (disabled) return;

    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
    }

    if (onRemove && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      onRemove(e as unknown as React.MouseEvent<HTMLButtonElement>);
    }
  };

  return (
    <div
      data-slot="tag"
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive && !disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={onRemove ? 'Delete' : undefined}
      onClick={!disabled && onClick ? onClick : undefined}
      onKeyDown={isInteractive || onRemove ? handleKeyDown : onKeyDown}
      className={cn(
        tagSizeVariants({ size, pill }),
        tagVariants({ variant }),
        onRemove && 'group',
        className,
      )}
      {...props}>
      {children}

      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={e => {
            e.stopPropagation();
            onRemove(e);
          }}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center justify-center transition-opacity outline-none',
            'opacity-60 group-hover:opacity-[0.88] disabled:opacity-30',
            'disabled:cursor-not-allowed',
            dismissIconColor[variant ?? 'primary'],
          )}
          aria-label="Remove tag">
          <Close className={cn(size !== 'xs' && 'ml-1', 'size-4')} />
        </button>
      )}
    </div>
  );
}

export { Tag, tagBaseStyles, tagSizeVariants, tagVariants };
