'use client';

import { format, isValid, parse, startOfDay } from 'date-fns';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { CalendarMonth } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { IconShell } from '@/components/ui/icon-shell';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TimeSegmentInput, TimeSeparator } from '@/components/ui/time-input';
import { cn } from '@/lib/utils';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';
const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy';
const DATE_DIGIT_COUNT = 8;
// A date with no time means "expires at the end of that day". Defaulting to
// 00:00 instead would make "today" an already-expired key.
const END_OF_DAY_HOUR = 23;
const END_OF_DAY_MINUTE = 59;

/**
 * `<input type="date">` renders its separators from the browser's UI locale and
 * ignores both `lang` and `field-sizing`, so it can be neither formatted as
 * dd/MM/yyyy nor shrunk to its content. The date half is therefore a masked
 * text input; the time half uses the design system's segmented inputs, which
 * are locale-independent and styleable in every browser.
 */

// field-sizing-content grows the input to fit the typed date so the last digit
// is never clipped; min-w reserves room for the dd/mm/yyyy placeholder when
// empty, and is the fallback where field-sizing is unsupported.
const dateSegmentClassName = cn(
  'min-w-0 flex-none',
  'data-[empty=true]:text-fg-tertiary',
  'data-[empty=false]:text-fg-primary',
  // w-auto is required: Input's base class is w-full, which min-w alone cannot
  // suppress and which would stretch the date over the whole row.
  'w-auto field-sizing-content min-w-[86px]',
);

/** Groups digits as dd/MM/yyyy, inserting separators as they arrive. */
function maskDateInput(digits: string): string {
  const groups = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  return groups.filter(group => group.length > 0).join('/');
}

function digitsOf(text: string): string {
  return text.replaceAll(/\D/g, '');
}

function caretAfterDigit(text: string, digitIndex: number): number {
  if (digitIndex <= 0) {
    return 0;
  }
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] >= '0' && text[index] <= '9') {
      seen += 1;
      if (seen === digitIndex) {
        return index + 1;
      }
    }
  }
  return text.length;
}

/**
 * Re-masks the raw input value while keeping the caret on the digit the user
 * was editing. Typing into an already-complete date overwrites the digit under
 * the caret instead of shifting the rest, so a mistyped date can be corrected
 * in place rather than cascading into a different date.
 */
function applyDateEdit(
  previous: string,
  raw: string,
  caret: number,
): { text: string; caret: number } {
  const digitsBeforeCaret = digitsOf(raw.slice(0, caret)).length;
  let digits = digitsOf(raw);

  if (
    digits.length > DATE_DIGIT_COUNT &&
    digitsOf(previous).length === DATE_DIGIT_COUNT
  ) {
    const overflow = digits.length - DATE_DIGIT_COUNT;
    digits =
      digits.slice(0, digitsBeforeCaret) +
      digits.slice(digitsBeforeCaret + overflow);
  }

  digits = digits.slice(0, DATE_DIGIT_COUNT);
  const text = maskDateInput(digits);
  return {
    text,
    caret: caretAfterDigit(text, Math.min(digitsBeforeCaret, digits.length)),
  };
}

/** Parses dd/MM/yyyy, rejecting impossible dates such as 31/02/2026. */
function parseDisplayDate(text: string): Date | undefined {
  if (text.length !== DISPLAY_DATE_FORMAT.length) {
    return undefined;
  }
  const parsed = parse(text, DISPLAY_DATE_FORMAT, new Date());
  if (!isValid(parsed) || format(parsed, DISPLAY_DATE_FORMAT) !== text) {
    return undefined;
  }
  return parsed;
}

function datePartOf(value: string): string {
  return value ? (value.split('T')[0] ?? '') : '';
}

function timePartOf(value: string): string {
  return value ? (value.split('T')[1] ?? '') : '';
}

function isoToDisplay(isoDate: string): string {
  if (!isoDate) {
    return '';
  }
  const parsed = parse(isoDate, ISO_DATE_FORMAT, new Date());
  return isValid(parsed) ? format(parsed, DISPLAY_DATE_FORMAT) : '';
}

interface TimeParts {
  hour: number | null;
  minute: number | null;
}

function parseTimePart(time: string): TimeParts {
  const [rawHour, rawMinute] = time.split(':');
  const hour = Number.parseInt(rawHour ?? '', 10);
  const minute = Number.parseInt(rawMinute ?? '', 10);
  return {
    hour: Number.isNaN(hour) ? null : hour,
    minute: Number.isNaN(minute) ? null : minute,
  };
}

function formatTimeParts({ hour, minute }: TimeParts): string {
  if (hour === null || minute === null) {
    return '';
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Fills only the segments the user left empty, so clearing one half never
 *  discards the other. */
function withEndOfDayDefaults({ hour, minute }: TimeParts): TimeParts {
  return {
    hour: hour ?? END_OF_DAY_HOUR,
    minute: minute ?? END_OF_DAY_MINUTE,
  };
}

interface DateTimeFieldProps {
  /** Injected by FormControl's Slot; do not pass explicitly, or it wins over
   *  the id FormLabel's htmlFor points at. */
  readonly id?: string;
  /** Value in `datetime-local` form: `yyyy-MM-ddTHH:mm`, or empty. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: (event: React.FocusEvent<HTMLDivElement>) => void;
  readonly name?: string;
  readonly ref?: React.Ref<HTMLInputElement>;
  readonly disabled?: boolean;
  /** Id of the visible field label, announced as the group's name. */
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean | 'true' | 'false';
}

export function DateTimeField({
  id,
  value,
  onChange,
  onBlur,
  name,
  ref,
  disabled,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: Readonly<DateTimeFieldProps>) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Both halves are local state: a partly typed date has no ISO equivalent, and
  // a time entered before a date cannot be represented in the value at all.
  const [dateText, setDateText] = useState(() =>
    isoToDisplay(datePartOf(value)),
  );
  const [time, setTime] = useState<TimeParts>(() =>
    parseTimePart(timePartOf(value)),
  );
  const [month, setMonth] = useState<Date | undefined>(() => {
    const parsed = parse(datePartOf(value), ISO_DATE_FORMAT, new Date());
    return isValid(parsed) ? parsed : undefined;
  });

  // Adopt values that arrive from outside (async default, form.reset) but not
  // the ones we just emitted, which would clobber in-progress typing.
  const [syncedValue, setSyncedValue] = useState(value);
  const [emittedValue, setEmittedValue] = useState(value);

  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== emittedValue) {
      setEmittedValue(value);
      const nextDatePart = datePartOf(value);
      setDateText(isoToDisplay(nextDatePart));
      setTime(parseTimePart(timePartOf(value)));
      const parsed = parse(nextDatePart, ISO_DATE_FORMAT, new Date());
      if (isValid(parsed)) {
        setMonth(parsed);
      }
    }
  }

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) {
      return;
    }
    pendingCaret.current = null;
    dateRef.current?.setSelectionRange(caret, caret);
  });

  const selectedDate = parseDisplayDate(dateText);

  /**
   * Emits `yyyy-MM-ddTHH:mm` once the date parses. Otherwise it mirrors the raw
   * text, so a half-typed date reaches the form as an invalid value the schema
   * can reject — rather than as `''`, which reads as "no expiry" and would
   * silently create a never-expiring key.
   */
  const emit = (nextDateText: string, nextTime: TimeParts) => {
    const parsed = parseDisplayDate(nextDateText);
    const next = parsed
      ? `${format(parsed, ISO_DATE_FORMAT)}T${formatTimeParts(withEndOfDayDefaults(nextTime))}`
      : nextDateText || formatTimeParts(nextTime);
    setEmittedValue(next);
    onChange(next);
  };

  /** Fills the time when a date first becomes usable, so the field shows the
   *  end-of-day value that will actually be submitted. */
  const commitDate = (nextDateText: string) => {
    const parsed = parseDisplayDate(nextDateText);
    if (!parsed) {
      emit(nextDateText, time);
      return;
    }
    const effectiveTime = withEndOfDayDefaults(time);
    setTime(effectiveTime);
    setMonth(parsed);
    emit(nextDateText, effectiveTime);
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const edit = applyDateEdit(
      dateText,
      input.value,
      input.selectionStart ?? input.value.length,
    );
    setDateText(edit.text);
    pendingCaret.current = edit.caret;

    // An emptied date means "no expiration", so a leftover time must not stay
    // behind as an incomplete value that blocks submit.
    if (!edit.text) {
      const cleared: TimeParts = { hour: null, minute: null };
      setTime(cleared);
      emit('', cleared);
      return;
    }

    commitDate(edit.text);
  };

  const handleHourChange = (hour: number | null) => {
    const nextTime = { ...time, hour };
    setTime(nextTime);
    emit(dateText, nextTime);
  };

  const handleMinuteChange = (minute: number | null) => {
    const nextTime = { ...time, minute };
    setTime(nextTime);
    emit(dateText, nextTime);
  };

  /**
   * Normalises a half-cleared time back to end of day once focus leaves, so the
   * field can never display a blank time while submitting 23:59.
   */
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    if (
      parseDisplayDate(dateText) &&
      (time.hour === null || time.minute === null)
    ) {
      const effectiveTime = withEndOfDayDefaults(time);
      setTime(effectiveTime);
      emit(dateText, effectiveTime);
    }
    onBlur?.(event);
  };

  const handleCalendarSelect = (nextDate: Date | undefined) => {
    if (nextDate) {
      const nextText = format(nextDate, DISPLAY_DATE_FORMAT);
      setDateText(nextText);
      commitDate(nextText);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <div
        role="group"
        aria-labelledby={ariaLabelledBy}
        onBlur={handleBlur}>
        <InputGroup variant="inline" size="default" className="gap-3">
          <InputGroupInput
            id={fieldId}
            ref={node => {
              dateRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            name={name}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            variant="inline"
            size="default"
            placeholder="dd/mm/yyyy"
            value={dateText}
            onChange={handleDateChange}
            disabled={disabled}
            data-empty={dateText ? 'false' : 'true'}
            className={dateSegmentClassName}
            aria-label="Date"
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
          />

          <div className="flex flex-none items-center">
            <TimeSegmentInput
              ref={hourRef}
              id={`${fieldId}-hour`}
              data-slot="input-group-control"
              value={time.hour}
              onChange={handleHourChange}
              min={0}
              max={23}
              disabled={disabled}
              onComplete={() => minuteRef.current?.focus()}
              onNavigateRight={() => minuteRef.current?.focus()}
              aria-label="Hour"
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
            />
            <TimeSeparator className="w-1" />
            <TimeSegmentInput
              ref={minuteRef}
              id={`${fieldId}-minute`}
              data-slot="input-group-control"
              value={time.minute}
              onChange={handleMinuteChange}
              min={0}
              max={59}
              disabled={disabled}
              onNavigateLeft={() => hourRef.current?.focus()}
              aria-label="Minute"
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
            />
          </div>

          <InputGroupAddon align="inline-end" className="ml-auto">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label="Open calendar">
                <IconShell size="sm" variant="secondary">
                  <CalendarMonth />
                </IconShell>
              </Button>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <PopoverContent
        className="w-auto overflow-hidden border-none p-0"
        align="start"
        sideOffset={4}>
        <Calendar
          mode="single"
          selected={selectedDate}
          month={month}
          onMonthChange={setMonth}
          onSelect={handleCalendarSelect}
          disabled={{ before: startOfDay(new Date()) }}
        />
      </PopoverContent>
    </Popover>
  );
}
