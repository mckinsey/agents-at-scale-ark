'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Schedule } from '../icons';
import { inputVariantStyles } from './input';

// ============================================================================
// TYPES
// ============================================================================

type TimeInputSize = 'sm' | 'default' | 'lg';
type TimeInputVariant = 'default' | 'inline';
type ValidationState = 'error' | 'warning' | 'success';

// ============================================================================
// CVA — TimeInputRoot
// ============================================================================

const defaultFocusStyles = [
  'has-[:focus-visible]:bg-stateslayer-overlay-active-inverse',
  'has-[:focus-visible]:ring-stroke-status-focus',
  'has-[:focus-visible]:shadow-elevation-0',
  'data-[open=true]:bg-stateslayer-overlay-active-inverse',
  'data-[open=true]:ring-stroke-status-focus',
  'data-[open=true]:shadow-elevation-0',
] as const;

const inlineFocusStyles = [
  'has-[:focus-visible]:border-b-stroke-status-focus',
  'has-[:focus-visible]:ring-0',
  'has-[:focus-visible]:shadow-elevation-0',
  'data-[open=true]:border-b-stroke-status-focus',
  'data-[open=true]:ring-0',
  'data-[open=true]:shadow-elevation-0',
] as const;

const defaultValidationStyles = [
  'data-[validation=error]:border data-[validation=error]:border-stroke-status-error data-[validation=error]:ring-0',
  'data-[validation=warning]:border data-[validation=warning]:border-stroke-status-warning data-[validation=warning]:ring-0',
  'data-[validation=success]:border data-[validation=success]:border-stroke-status-success data-[validation=success]:ring-0',
] as const;

const inlineValidationStyles = [
  'data-[validation=error]:border-b-stroke-status-error data-[validation=error]:ring-0',
  'data-[validation=warning]:border-b-stroke-status-warning data-[validation=warning]:ring-0',
  'data-[validation=success]:border-b-stroke-status-success data-[validation=success]:ring-0',
] as const;

const timeInputFocusRingWidth = {
  sm: 'has-[:focus-visible]:ring-[1px] data-[open=true]:ring-[1px]',
  default: 'has-[:focus-visible]:ring-[1px] data-[open=true]:ring-[1px]',
  lg: 'has-[:focus-visible]:ring-[2px] data-[open=true]:ring-[2px]',
} as const;

const timeInputInlineFocusBorderWidth = {
  sm: 'has-[:focus-visible]:border-b-[1px] data-[open=true]:border-b-[1px]',
  default:
    'has-[:focus-visible]:border-b-[1px] data-[open=true]:border-b-[1px]',
  lg: 'has-[:focus-visible]:border-b-[2px] data-[open=true]:border-b-[2px]',
} as const;

const timeInputRootVariants = cva(
  'inline-flex items-center border-0 cursor-text rounded-none outline-none text-fg-primary gap-1',
  {
    variants: {
      variant: {
        default: [
          inputVariantStyles.default.base,
          inputVariantStyles.default.hover,
          ...defaultFocusStyles,
          ...defaultValidationStyles,
          'data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed',
          'data-[disabled=true]:bg-stateslayer-overlay-disabled data-[disabled=true]:text-fg-disabled',
          'border-0',
        ],
        inline: [
          inputVariantStyles.inline.base,
          inputVariantStyles.inline.border,
          inputVariantStyles.inline.hover,
          ...inlineFocusStyles,
          ...inlineValidationStyles,
          'data-[disabled=true]:pointer-events-none data-[disabled=true]:cursor-not-allowed',
          'data-[disabled=true]:text-fg-disabled',
          'justify-between pl-0! pr-0!',
        ],
      },
      size: {
        sm: 'h-7 pl-2 pr-1 py-1 paragraph-regular-primary',
        default: 'h-9 pl-2 pr-1 py-2 paragraph-regular-primary',
        lg: 'h-10 pl-2 pr-1 py-2 paragraph-large-primary',
      },
    },
    compoundVariants: [
      {
        variant: 'default',
        size: 'sm',
        className: timeInputFocusRingWidth.sm,
      },
      {
        variant: 'default',
        size: 'default',
        className: timeInputFocusRingWidth.default,
      },
      {
        variant: 'default',
        size: 'lg',
        className: timeInputFocusRingWidth.lg,
      },
      {
        variant: 'inline',
        size: 'sm',
        className: `${timeInputInlineFocusBorderWidth.sm} w-[120px]`,
      },
      {
        variant: 'inline',
        size: 'default',
        className: `${timeInputInlineFocusBorderWidth.default} w-[120px]`,
      },
      {
        variant: 'inline',
        size: 'lg',
        className: `${timeInputInlineFocusBorderWidth.lg} w-[128px]`,
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

// ============================================================================
// TimeInputRoot — Styled container with focus delegation
// ============================================================================

export interface TimeInputRootProps
  extends
    React.ComponentProps<'div'>,
    VariantProps<typeof timeInputRootVariants> {
  disabled?: boolean;
  validationState?: ValidationState;
}

const TimeInputRoot = React.forwardRef<HTMLDivElement, TimeInputRootProps>(
  (
    {
      className,
      variant,
      size,
      disabled,
      validationState,
      onClick,
      onPointerDown,
      children,
      ...props
    },
    ref,
  ) => {
    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const clickedInput = target.closest<HTMLInputElement>('input');

      if (clickedInput) {
        const isOpen = e.currentTarget.dataset.state === 'open';

        if (isOpen) {
          e.nativeEvent.stopImmediatePropagation();
        } else {
          onPointerDown?.(e);
        }

        clickedInput.focus();
        return;
      }

      onPointerDown?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);

      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement;

      if (target.closest('input') || target.closest('button')) {
        return;
      }

      const root = e.currentTarget;
      const emptySegment = root.querySelector<HTMLInputElement>(
        '[data-slot="time-segment"][data-empty]',
      );
      const firstSegment = root.querySelector<HTMLInputElement>(
        '[data-slot="time-segment"]',
      );

      (emptySegment ?? firstSegment)?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const root = e.currentTarget;
        const emptySegment = root.querySelector<HTMLInputElement>(
          '[data-slot="time-segment"][data-empty]',
        );
        const firstSegment = root.querySelector<HTMLInputElement>(
          '[data-slot="time-segment"]',
        );
        (emptySegment ?? firstSegment)?.focus();
      }
    };

    return (
      <div
        {...props}
        ref={ref}
        role="group"
        data-slot="time-input-root"
        data-disabled={disabled || undefined}
        data-validation={validationState || undefined}
        className={cn(timeInputRootVariants({ variant, size }), className)}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onKeyDown={handleKeyDown}>
        {children}
      </div>
    );
  },
);

TimeInputRoot.displayName = 'TimeInputRoot';

// ============================================================================
// TimeSegmentInput — Generic clamped numeric segment
// ============================================================================

export interface TimeSegmentInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'min' | 'max' | 'step' | 'type' | 'size'
> {
  value?: number | null;
  onChange?: (value: number | null) => void;
  onComplete?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  min?: number;
  max?: number;
  step?: number;
}

const TimeSegmentInput = React.forwardRef<
  HTMLInputElement,
  TimeSegmentInputProps
>(
  (
    {
      value,
      onChange,
      onComplete,
      onNavigateLeft,
      onNavigateRight,
      min = 0,
      max = 59,
      step = 1,
      placeholder = '--',
      disabled,
      className,
      onFocus,
      onBlur,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const bufferRef = React.useRef('');

    const displayValue =
      value === null || value === undefined
        ? ''
        : String(value).padStart(2, '0');

    const clamp = (v: number) => Math.min(max, Math.max(min, v));

    const handleDigitEntry = (key: string) => {
      bufferRef.current += key;

      if (bufferRef.current.length === 1) {
        const digit = Number.parseInt(bufferRef.current, 10);
        onChange?.(clamp(digit));

        // Auto-complete if first digit makes a valid 2-digit value impossible
        if (digit * 10 > max) {
          bufferRef.current = '';
          onComplete?.();
        }
      } else {
        const val = Number.parseInt(bufferRef.current, 10);
        onChange?.(clamp(val));
        bufferRef.current = '';
        onComplete?.();
      }
    };

    const incrementValue = () => {
      if (value === null || value === undefined) return onChange?.(min);

      const next = value + step > max ? min : value + step;
      onChange?.(next);
    };

    const decrementValue = () => {
      if (value === null || value === undefined) return onChange?.(max);

      const prev = value - step < min ? max : value - step;
      onChange?.(prev);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);

      if (e.defaultPrevented) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitEntry(e.key);
        return;
      }

      const input = e.currentTarget;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          incrementValue();
          break;

        case 'ArrowDown':
          e.preventDefault();
          decrementValue();
          break;

        case 'ArrowLeft':
          if (input.selectionStart === 0) {
            e.preventDefault();
            onNavigateLeft?.();
          }
          break;

        case 'ArrowRight': {
          const len = input.value.length;

          if (input.selectionEnd === len || len === 0) {
            e.preventDefault();
            onNavigateRight?.();
          }
          break;
        }

        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          onChange?.(null);
          bufferRef.current = '';
          break;
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      bufferRef.current = '';
      requestAnimationFrame(() => e.target.select());
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      bufferRef.current = '';
      onBlur?.(e);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        maxLength={2}
        data-slot="time-segment"
        data-empty={value === null || value === undefined ? '' : undefined}
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn(
          'w-[2ch] bg-transparent text-center text-inherit outline-none',
          'placeholder:text-fg-tertiary focus:placeholder:text-fg-primary',
          'disabled:text-fg-disabled disabled:placeholder:text-fg-disabled',
          'selection:bg-fill-active selection:text-fg-primary-inverse',
          className,
        )}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={e => e.preventDefault()}
        onChange={() => {}}
        {...props}
      />
    );
  },
);

TimeSegmentInput.displayName = 'TimeSegmentInput';

// ============================================================================
// TimeSeparator — The ":" between segments
// ============================================================================

export type TimeSeparatorProps = React.ComponentProps<'span'>;

function TimeSeparator({
  className,
  children = ':',
  ...props
}: Readonly<TimeSeparatorProps>) {
  return (
    <span
      data-slot="time-separator"
      className={cn('inline-block text-inherit select-none', className)}
      aria-hidden="true"
      {...props}>
      {children}
    </span>
  );
}

TimeSeparator.displayName = 'TimeSeparator';

// ============================================================================
// TimeInputTrigger — Clock icon button
// ============================================================================

const segmentWidthMap = {
  sm: 'w-7',
  default: 'w-7',
  lg: 'w-8',
} as const;

const triggerSizeMap = {
  sm: 'size-5',
  default: 'size-5',
  lg: 'size-7',
} as const;

const triggerIconSizeMap = {
  sm: 'size-4',
  default: 'size-4',
  lg: 'size-6',
} as const;

export interface TimeInputTriggerProps extends Omit<
  React.ComponentProps<'button'>,
  'size'
> {
  size?: TimeInputSize;
}

function TimeInputTrigger({
  size = 'default',
  disabled,
  className,
  children,
  ...props
}: Readonly<TimeInputTriggerProps>) {
  return (
    <button
      type="button"
      data-slot="time-input-trigger"
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'cursor-pointer rounded-none border-0 bg-transparent p-0 outline-none',
        'text-fill-active',
        'disabled:text-fg-disabled disabled:cursor-not-allowed',
        triggerSizeMap[size],
        className,
      )}
      {...props}>
      {children ?? (
        <Schedule
          className={cn('text-[length:inherit]', triggerIconSizeMap[size])}
        />
      )}
    </button>
  );
}

TimeInputTrigger.displayName = 'TimeInputTrigger';

// ============================================================================
// TimeInput — Convenience wrapper
// ============================================================================

type NativeTimeInputProps = Pick<
  React.ComponentProps<'input'>,
  'min' | 'max' | 'step' | 'name' | 'required' | 'disabled' | 'id' | 'autoFocus'
>;

export interface TimeInputProps
  extends
    Omit<React.ComponentProps<'div'>, 'onChange' | keyof NativeTimeInputProps>,
    NativeTimeInputProps {
  variant?: TimeInputVariant;
  size?: TimeInputSize;
  hour?: number | null;
  minute?: number | null;
  onHourChange?: (hour: number | null) => void;
  onMinuteChange?: (minute: number | null) => void;
  onTriggerClick?: () => void;
  validationState?: ValidationState;
  placeholderHour?: string;
  placeholderMinute?: string;
}

function parseTimeString(
  str: string | number | undefined,
): { hour: number; minute: number } | null {
  if (str === null || str === undefined) return null;

  const s = String(str);
  const parts = s.split(':');

  if (parts.length < 2) return null;

  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  return { hour, minute };
}

const TimeInput = React.forwardRef<HTMLDivElement, TimeInputProps>(
  (
    {
      variant,
      size = 'default',
      hour,
      minute,
      onHourChange,
      onMinuteChange,
      onTriggerClick,
      validationState,
      placeholderHour = 'hh',
      placeholderMinute = 'mm',
      min,
      max,
      step,
      name,
      required,
      disabled,
      id,
      autoFocus,
      ...divProps
    },
    ref,
  ) => {
    const hourRef = React.useRef<HTMLInputElement>(null);
    const minuteRef = React.useRef<HTMLInputElement>(null);

    const minTime = parseTimeString(min);
    const maxTime = parseTimeString(max);

    const minHour = minTime?.hour ?? 0;
    const maxHour = maxTime?.hour ?? 23;
    const minMinute = minTime?.minute ?? 0;
    const maxMinute = maxTime?.minute ?? 59;

    let stepSeconds = 60;

    if (typeof step === 'number') {
      stepSeconds = step;
    } else if (typeof step === 'string') {
      stepSeconds = Number.parseInt(step, 10) || 60;
    }
    const minuteStep = Math.max(1, Math.floor(stepSeconds / 60));

    const separatorClass = size === 'lg' ? 'w-2' : 'w-1';

    return (
      <TimeInputRoot
        ref={ref}
        variant={variant}
        size={size}
        disabled={disabled}
        validationState={validationState}
        {...divProps}>
        <div>
          <TimeSegmentInput
            ref={hourRef}
            value={hour}
            onChange={onHourChange}
            min={minHour}
            max={maxHour}
            placeholder={placeholderHour}
            disabled={disabled}
            onComplete={() => minuteRef.current?.focus()}
            onNavigateRight={() => minuteRef.current?.focus()}
            id={id}
            name={name ? `${name}-hour` : undefined}
            required={required}
            autoFocus={autoFocus}
            className={segmentWidthMap[size]}
          />

          <TimeSeparator className={separatorClass} />

          <TimeSegmentInput
            ref={minuteRef}
            value={minute}
            onChange={onMinuteChange}
            min={minMinute}
            max={maxMinute}
            step={minuteStep}
            placeholder={placeholderMinute}
            disabled={disabled}
            onNavigateLeft={() => hourRef.current?.focus()}
            name={name ? `${name}-minute` : undefined}
            required={required}
            className={segmentWidthMap[size]}
          />
        </div>
        <TimeInputTrigger
          size={size}
          disabled={disabled}
          onClick={onTriggerClick}
        />
      </TimeInputRoot>
    );
  },
);

TimeInput.displayName = 'TimeInput';

// ============================================================================
// EXPORTS
// ============================================================================

export {
  TimeInputRoot,
  TimeSegmentInput,
  TimeSeparator,
  TimeInputTrigger,
  TimeInput,
  timeInputRootVariants,
};
