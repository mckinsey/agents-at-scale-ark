'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import * as React from 'react';

import { ChevronDown } from '@/components/icons/ChevronDown';
import { cn } from '@/lib/utils';

export type SelectSize = 'sm' | 'default' | 'lg';

interface SelectSizeContextValue {
  size?: SelectSize;
}

const SelectSizeContext = React.createContext<
  SelectSizeContextValue | undefined
>(undefined);

const useSelectSizeContext = () => {
  return React.useContext(SelectSizeContext);
};

type SelectProps = React.ComponentProps<typeof SelectPrimitive.Root> & {
  /**
   * The size of the select and its items.
   * @default "default"
   */
  size?: SelectSize;
};

/**
 * Select component for choosing from a list of options.
 *
 * Built on Base UI Select primitive. Supports single and multiple selection
 * via the `multiple` prop.
 *
 * @example
 * ```tsx
 * <Select items={items}>
 *   <SelectTrigger>
 *     <SelectValue placeholder="Pick one" />
 *   </SelectTrigger>
 *   <SelectContent>
 *     <SelectItem value="a">Option A</SelectItem>
 *     <SelectItem value="b">Option B</SelectItem>
 *   </SelectContent>
 * </Select>
 * ```
 */
function Select({ size = 'default', children, ...props }: SelectProps) {
  return (
    <SelectSizeContext.Provider value={{ size }}>
      <SelectPrimitive.Root data-slot="select" {...props}>
        {children}
      </SelectPrimitive.Root>
    </SelectSizeContext.Provider>
  );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectIcon({ className, ...props }: SelectPrimitive.Icon.Props) {
  const sizeContext = useSelectSizeContext();
  const size = sizeContext?.size ?? 'default';

  return (
    <SelectPrimitive.Icon
      data-slot="select-icon"
      className={cn(
        'text-fill-active shrink-0 opacity-60',
        '[[data-disabled]>&]:opacity-30',
        size === 'lg' ? 'size-6' : 'size-4',
        className,
      )}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  const sizeContext = useSelectSizeContext();
  const size = sizeContext?.size ?? 'default';

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'relative flex w-fit items-center justify-between whitespace-nowrap',
        'bg-fill-onsurface-ui-3 transition-all outline-none',
        'border border-transparent',
        'cursor-pointer data-disabled:cursor-not-allowed data-disabled:opacity-50',

        'text-fg-primary',
        'data-placeholder:text-fg-tertiary',

        'hover:bg-stateslayer-overlay-hover',

        'focus-visible:bg-stateslayer-overlay-active-inverse focus-visible:border-stroke-status-focus',
        'data-[popup-open]:bg-stateslayer-overlay-active-inverse data-[popup-open]:border-stroke-status-focus',
        'data-[popup-open]:shadow-elevation-0',

        size === 'sm' && 'paragraph-regular-primary gap-1 px-2 py-1',
        size === 'default' && 'paragraph-regular-primary gap-2 p-2',
        size === 'lg' && 'paragraph-large-primary gap-2 p-3',

        'data-invalid:border-destructive',

        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
        (size === 'sm' || size === 'default') && '[&_svg]:size-4',
        size === 'lg' && '[&_svg]:size-6',

        '*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2',
        className,
      )}
      {...props}>
      {children}
      <SelectIcon className="transition-transform duration-200 [[data-popup-open]>&]:rotate-180">
        <ChevronDown />
      </SelectIcon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  sideOffset = 4,
  alignItemWithTrigger = false,
  ...positionerProps
}: SelectPrimitive.Positioner.Props & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-[60]"
        {...positionerProps}>
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'bg-stateslayer-overlay-active-inverse text-fg-primary',
            'relative overflow-hidden',
            'shadow-elevation-1',
            'data-open:animate-in data-closed:animate-out',
            'data-closed:fade-out-0 data-open:fade-in-0',
            'data-closed:zoom-out-95 data-open:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}>
          <SelectScrollUpArrow />
          <SelectPrimitive.List className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] p-1">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownArrow />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('border-stroke-divider mb-1 border-b pb-1', className)}
      {...props}
    />
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        'text-fg-tertiary paragraph-small-primary px-2 py-1.5',
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  const sizeContext = useSelectSizeContext();
  const size = sizeContext?.size ?? 'default';

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-default items-center outline-none select-none',

        (size === 'sm' || size === 'default') &&
          'paragraph-regular-primary gap-2 py-2 pr-2 pl-1',
        size === 'lg' && 'paragraph-large-primary gap-1 p-2',

        'text-fg-secondary',

        'data-highlighted:bg-stateslayer-overlay-hover data-highlighted:text-fg-primary cursor-pointer',
        'active:bg-stateslayer-overlay-pressed',

        'data-disabled:text-fg-disabled data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}>
      {children}
    </SelectPrimitive.Item>
  );
}

function SelectItemText({
  className,
  ...props
}: SelectPrimitive.ItemText.Props) {
  return (
    <SelectPrimitive.ItemText
      data-slot="select-item-text"
      className={cn(
        'flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

function SelectItemIndicator({
  className,
  children,
  ...props
}: SelectPrimitive.ItemIndicator.Props) {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      className={cn('flex items-center justify-center', className)}
      {...props}>
      {children}
    </SelectPrimitive.ItemIndicator>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <div
      className={cn('pointer-events-none flex h-2 w-full flex-col', className)}>
      <div className="h-1 w-full" />
      <SelectPrimitive.Separator
        className="border-stroke-divider h-1 w-full border-b"
        data-slot="select-separator"
        {...props}
      />
    </div>
  );
}

function SelectScrollUpArrow({
  className,
  ...props
}: SelectPrimitive.ScrollUpArrow.Props) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-arrow"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}>
      <ChevronDown className="size-4 rotate-180" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownArrow({
  className,
  ...props
}: SelectPrimitive.ScrollDownArrow.Props) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-arrow"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}>
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectScrollDownArrow,
  SelectScrollUpArrow,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  useSelectSizeContext,
};
