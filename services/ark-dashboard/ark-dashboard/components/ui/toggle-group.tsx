'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-3',
        sm: 'h-8 px-2',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface ToggleGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toggleVariants> {
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string) => void;
}

const ToggleGroupContext = React.createContext<{
  value?: string | string[];
  onValueChange?: (value: string) => void;
  variant?: 'default' | 'outline' | null;
  size?: 'default' | 'sm' | 'lg' | null;
}>({});

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  (
    {
      className,
      variant,
      size,
      children,
      type = 'single',
      value,
      defaultValue,
      onValueChange,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(
      defaultValue || '',
    );
    const currentValue = value !== undefined ? value : internalValue;

    const handleValueChange = (newValue: string) => {
      if (type === 'single') {
        const updatedValue = currentValue === newValue ? '' : newValue;
        setInternalValue(updatedValue);
        onValueChange?.(updatedValue);
      }
    };

    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-center gap-1', className)}
        {...props}>
        <ToggleGroupContext.Provider
          value={{
            value: currentValue,
            onValueChange: handleValueChange,
            variant,
            size,
          }}>
          {children}
        </ToggleGroupContext.Provider>
      </div>
    );
  },
);

ToggleGroup.displayName = 'ToggleGroup';

interface ToggleGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof toggleVariants> {
  value: string;
  'aria-label'?: string;
}

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  ToggleGroupItemProps
>(({ className, children, variant, size, value, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);
  const isSelected = context.value === value;

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={isSelected}
      data-state={isSelected ? 'on' : 'off'}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      onClick={() => context.onValueChange?.(value)}
      {...props}>
      {children}
    </button>
  );
});

ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, toggleVariants };
