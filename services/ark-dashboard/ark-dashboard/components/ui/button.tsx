import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

// State overlay gradients
/**
 * For hover and active states, we use a color with transparency on top of the button's background color.
 * To achive this, we use background-image:linear-gradient( color, color ),
 * which generates this color on top of the button's background color.
 *
 * NOTE:
 * Tailwind needs to see the full class name at build time, so we avoid
 * building these classes with template string interpolation.
 */
const hoverGradient = {
  normal:
    'hover:[background-image:linear-gradient(var(--color-stateslayer-overlay-hover),var(--color-stateslayer-overlay-hover))] disabled:hover:[background-image:none]',
  inverse:
    'hover:[background-image:linear-gradient(var(--color-stateslayer-overlay-hover-inverse),var(--color-stateslayer-overlay-hover-inverse))] disabled:hover:[background-image:none]',
} as const;

// active and pressed are the same state
const activeGradient = {
  normal:
    'active:[background-image:linear-gradient(var(--color-stateslayer-overlay-pressed),var(--color-stateslayer-overlay-pressed))] disabled:active:[background-image:none]',
  inverse:
    'active:[background-image:linear-gradient(var(--color-stateslayer-overlay-pressed-inverse),var(--color-stateslayer-overlay-pressed-inverse))] disabled:active:[background-image:none]',
} as const;

const disabledOverlayGradient =
  'disabled:[background-image:linear-gradient(var(--color-stateslayer-overlay-disabled),var(--color-stateslayer-overlay-disabled))]';

const commonDisabled = 'disabled:bg-fill-muted';

const buttonVariants = cva(
  [
    'relative cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap outline-none',
    'transition-all',
    'group/btn',
    'focus-visible:ring-stroke-status-focus',
    'disabled:cursor-not-allowed disabled:text-fg-disabled',
  ],
  {
    variants: {
      size: {
        xxs: ['px-1 py-0.5 gap-0.5', 'cta-button-03', 'focus-visible:ring-1'],
        xs: ['px-1 py-1 gap-0.5', 'cta-button-03', 'focus-visible:ring-1'],
        sm: ['px-2 py-1 gap-1', 'cta-button-02', 'focus-visible:ring-1'],
        default: ['p-2 gap-2', 'cta-button-02', 'focus-visible:ring-2'],
        lg: ['px-3 py-3 gap-2', 'cta-button-01', 'focus-visible:ring-2'],
        'icon-xs': ['size-5 p-0', 'focus-visible:ring-1'],
        'icon-sm': ['size-7 p-0', 'focus-visible:ring-1'],
        icon: ['size-9 p-0', 'focus-visible:ring-2'],
        'icon-lg': ['size-12 p-0', 'focus-visible:ring-2'],
      },
      variant: {
        default: [
          'bg-fill-primary text-fg-primary-inverse',
          hoverGradient.inverse,
          activeGradient.inverse,
          'focus-visible:bg-stateslayer-overlay-active',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-stroke-active-inverse',
          commonDisabled,
          disabledOverlayGradient,
        ],
        accent: [
          'bg-brand-accents-qb-accent text-mist-50-opacity-88',
          hoverGradient.normal,
          activeGradient.normal,
          'focus-visible:ring-offset-1 focus-visible:ring-offset-stroke-active-inverse',
          commonDisabled,
          disabledOverlayGradient,
        ],
        secondary: [
          'bg-fill-muted text-fg-primary',
          hoverGradient.normal,
          activeGradient.normal,
          'focus-visible:ring-1',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-stroke-active-inverse',
          commonDisabled,
          disabledOverlayGradient,
        ],
        outline: [
          'border border-stroke-secondary bg-fill-muted-inverse text-fg-primary',
          'focus-visible:border-stroke-active',
          'focus-visible:ring-1',
          hoverGradient.normal,
          activeGradient.normal,
          'focus-visible:bg-stateslayer-overlay-active-inverse',
          disabledOverlayGradient,
          'disabled:border-stroke-tertiary',
        ],
        ghost: [
          'bg-transparent text-fg-primary',
          'hover:bg-stateslayer-overlay-hover active:bg-stateslayer-overlay-pressed',
          'focus-visible:bg-stateslayer-overlay-active-inverse focus-visible:ring-1',
          'disabled:bg-transparent disabled:hover:bg-transparent disabled:active:bg-transparent',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/*
  This is done to ensure that only the text is underlined on hover, focus, and active states,
  and not other elements such as icons etc
*/
function wrapTextNodes(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string' || typeof child === 'number') {
      return (
        <span
          className="[text-underline-position:from-font] group-hover/btn:underline group-focus/btn:underline group-active/btn:underline group-disabled/btn:no-underline group-aria-disabled/btn:no-underline"
          key={String(child)}>
          {child}
        </span>
      );
    }

    return child;
  });
}

/**
 * Button props interface with JSDoc for auto-generated documentation
 */
interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /**
   * Render as a child component using Radix Slot.
   * When true, the button will merge its props with its immediate child element.
   * @default false
   */
  asChild?: boolean;
}

/**
 * Button component that allows users to take actions with a single click or tap.
 *
 * @example
 * ```tsx
 * <Button variant="default">Click me</Button>
 * <Button variant="accent" size="lg">Large Accent</Button>
 * <Button asChild><a href="/link">Link Button</a></Button>
 * ```
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const processedChildren = wrapTextNodes(children);

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}>
      {processedChildren}
    </Comp>
  );
}

export { Button, buttonVariants, wrapTextNodes };
