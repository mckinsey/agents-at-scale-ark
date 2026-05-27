'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import * as React from 'react';

import { Check } from '@/components/icons/check';
import { ChevronDown } from '@/components/icons/chevron-down';
import { Close } from '@/components/icons/close';
import { Button } from '@/components/ui/button';
import { inputVariantStyles } from '@/components/ui/input';
import { InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

// Defer border/bg/focus-ring/rounding/padding to the InputGroup wrapper
const inputGroupChildOverrides = [
  '[[data-slot=input-group]_&]:rounded-none [[data-slot=input-group]_&]:border-0 [[data-slot=input-group]_&]:bg-transparent',
  '[[data-slot=input-group]_&]:px-0! [[data-slot=input-group]_&]:py-0! [[data-slot=input-group]_&]:min-h-0',
  '[[data-slot=input-group]_&]:focus-within:bg-transparent [[data-slot=input-group]_&]:focus-within:shadow-none [[data-slot=input-group]_&]:focus-within:ring-0',
];

// Anchor ref context so popup width matches the full input group (not just the input element)
const ComboboxAnchorContext =
  React.createContext<React.RefObject<HTMLDivElement | null> | null>(null);

function useComboboxAnchorRef() {
  return React.useContext(ComboboxAnchorContext);
}

function Combobox(props: React.ComponentProps<typeof ComboboxPrimitive.Root>) {
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  return (
    <ComboboxAnchorContext.Provider value={anchorRef}>
      <ComboboxPrimitive.Root {...props} />
    </ComboboxAnchorContext.Provider>
  );
}

function ComboboxValue(props: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      // Fallback size for any unsized SVG slotted as children (internal ChevronDown always has size-4 explicit)
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}>
      {children}
      <ChevronDown
        data-slot="combobox-trigger-icon"
        className="text-fg-secondary pointer-events-none size-4"
      />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}>
      <Close className="pointer-events-none size-3" />
    </ComboboxPrimitive.Clear>
  );
}

/**
 * Wrapper that provides the anchor ref for the combobox popup.
 * Compose with InputGroup, ComboboxInput, ComboboxTrigger, ComboboxClear as needed.
 */
function ComboboxAnchor({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const anchorRef = useComboboxAnchorRef();

  return (
    <div
      ref={anchorRef}
      className={cn(
        // Named group so ComboboxContent positioner can anchor to the full width.
        // focus-within:outline-none suppresses the browser default; the visible
        // focus ring comes from InputGroup's has-[...focus-visible] selectors.
        'group/combobox-anchor w-full focus-within:outline-none',
        className,
      )}
      data-slot="combobox-anchor"
      {...props}>
      {children}
    </div>
  );
}

function ComboboxInput({
  disabled = false,
  size,
  variant,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'size' | 'variant'> & {
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'inline';
}) {
  return (
    <ComboboxPrimitive.Input
      render={
        <InputGroupInput
          disabled={disabled}
          size={size}
          variant={variant}
          data-slot="input-group-control"
        />
      }
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 6,
  align = 'start',
  alignOffset = 0,
  anchor: anchorProp,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  const anchorRef = useComboboxAnchorRef();
  const anchor = anchorProp ?? anchorRef;

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            // Match SelectContent: background, text, padding
            'bg-stateslayer-overlay-active-inverse text-fg-primary p-1',
            // Layout
            'relative z-50 min-w-[8rem] overflow-hidden',
            'group/combobox-content max-h-96 w-(--anchor-width) max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin)',
            // Shadow (same as Select)
            'shadow-elevation-1',
            // Animations (same as Select)
            'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            'duration-100',
            // Input group when nested (e.g. popup mode)
            '*:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:shadow-none',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'max-h-[min(calc(--spacing(96)---spacing(9)),calc(var(--available-height)---spacing(9)))] overflow-y-auto data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        // Match SelectItem: base layout
        'relative flex w-full cursor-default items-center justify-between outline-none select-none',
        // Size/padding (Select default)
        'gap-2 p-2',
        // Typography
        'text-sm leading-5',
        // State: default
        'text-fg-secondary',
        // State: highlighted (Base UI uses data-highlighted)
        'data-highlighted:bg-stateslayer-overlay-hover data-highlighted:text-fg-primary cursor-pointer',
        // State: disabled
        'data-[disabled]:text-fg-disabled data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed',
        className,
      )}
      {...props}>
      <span className="flex-1 overflow-hidden overflow-ellipsis whitespace-nowrap">
        {children}
      </span>
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        render={<span className="flex size-4 items-center justify-center" />}>
        <Check className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn('border-stroke-divider mb-1 border-b pb-1', className)}
      {...props}
    />
  );
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn('text-fg-secondary px-2 py-1.5 text-xs', className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'text-fg-secondary hidden w-full justify-center py-2 text-center text-sm group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn(
        'border-stroke-divider my-1 h-px w-full border-b',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        // Shared base + error styles from Input for visual consistency
        inputVariantStyles.default.base,
        inputVariantStyles.default.error,
        // focus-within (container focus) mirrors InputGroup focus-visible behaviour
        'focus-within:bg-stateslayer-overlay-enabled focus-within:ring-stroke-status-focus focus-within:shadow-elevation-1 focus-within:ring-[1px]',
        // Layout
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-[color,box-shadow] has-data-[slot=combobox-chip]:px-1.5',
        // When inside InputGroup, defer border/bg/focus-ring/rounding/padding to the wrapper
        ...inputGroupChildOverrides,
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  ...props
}: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'bg-fill-muted text-fg-primary flex h-[calc(--spacing(5.5))] w-fit items-center justify-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0',
        className,
      )}
      {...props}>
      {children}
      <ComboboxPrimitive.ChipRemove
        render={<Button variant="ghost" size="icon-xs" />}
        className="-ml-1 opacity-50 hover:opacity-100"
        data-slot="combobox-chip-remove">
        <Close className="pointer-events-none" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="input-group-control"
      className={cn(
        'min-w-16 flex-1 p-0 outline-none',
        inputVariantStyles.default.text,
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxValue,
};
