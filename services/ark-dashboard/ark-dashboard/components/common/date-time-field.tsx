'use client';

import { format, isValid, parse } from 'date-fns';
import { useId, useState } from 'react';

import { CalendarMonth } from '@/components/icons';
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
import { cn } from '@/lib/utils';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';
const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy';
// A date with no time means "expires at the end of that day". Defaulting to
// 00:00 instead would make "today" an already-expired key.
const END_OF_DAY_TIME = '23:59';

/**
 * `<input type="date">` renders its separators from the browser's UI locale and
 * ignores both `lang` and `field-sizing`, so it can be neither formatted as
 * dd/MM/yyyy nor shrunk to its content. The date half is therefore a masked
 * text input; the time half stays native, since `:` is locale-independent.
 */
const timeSegmentFocusClassName = cn(
  '[&::-webkit-datetime-edit-hour-field:focus]:bg-fill-active',
  '[&::-webkit-datetime-edit-hour-field:focus]:text-fg-primary-inverse',
  '[&::-webkit-datetime-edit-hour-field:focus]:rounded-none',
  '[&::-webkit-datetime-edit-hour-field:focus]:outline-none',
  '[&::-webkit-datetime-edit-minute-field:focus]:bg-fill-active',
  '[&::-webkit-datetime-edit-minute-field:focus]:text-fg-primary-inverse',
  '[&::-webkit-datetime-edit-minute-field:focus]:rounded-none',
  '[&::-webkit-datetime-edit-minute-field:focus]:outline-none',
);

const segmentClassName = cn(
  'min-w-0 flex-none',
  'data-[empty=true]:text-fg-tertiary',
  'data-[empty=false]:text-fg-primary',
);

// field-sizing-content grows the input to fit the typed date so the last digit
// is never clipped; min-w reserves room for the dd/mm/yyyy placeholder when
// empty, and is the fallback where field-sizing is unsupported.
const dateSegmentClassName = cn(
  segmentClassName,
  // w-auto is required: Input's base class is w-full, which min-w alone cannot
  // suppress and which would stretch the date over the whole row.
  'w-auto field-sizing-content min-w-[86px]',
);

const timeSegmentClassName = cn(
  segmentClassName,
  'w-auto',
  '[&::-webkit-calendar-picker-indicator]:hidden',
  '[&::-webkit-calendar-picker-indicator]:appearance-none',
  timeSegmentFocusClassName,
);

/** Groups typed digits as dd/MM/yyyy, inserting separators as they arrive. */
function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const groups = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  return groups.filter(group => group.length > 0).join('/');
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

interface DateTimeFieldProps {
  /** Injected by FormControl's Slot; do not pass explicitly, or it wins over
   *  the id FormLabel's htmlFor points at. */
  readonly id?: string;
  /** Value in `datetime-local` form: `yyyy-MM-ddTHH:mm`, or empty. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly dateLabel?: string;
  readonly timeLabel?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean | 'true' | 'false';
}

export function DateTimeField({
  id,
  value,
  onChange,
  disabled,
  dateLabel = 'Date',
  timeLabel = 'Time',
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: Readonly<DateTimeFieldProps>) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);

  // Both halves are local state: a partly typed date has no ISO equivalent, and
  // a time entered before a date cannot be represented in the value at all.
  const [dateText, setDateText] = useState(() =>
    isoToDisplay(datePartOf(value)),
  );
  const [timeText, setTimeText] = useState(() => timePartOf(value));
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
      setTimeText(timePartOf(value));
      const parsed = parse(nextDatePart, ISO_DATE_FORMAT, new Date());
      if (isValid(parsed)) {
        setMonth(parsed);
      }
    }
  }

  const selectedDate = parseDisplayDate(dateText);

  /**
   * Emits `yyyy-MM-ddTHH:mm` once the date parses. Otherwise it mirrors the raw
   * text, so a half-typed date reaches the form as an invalid value the schema
   * can reject — rather than as `''`, which reads as "no expiry" and would
   * silently create a never-expiring key.
   */
  const emit = (nextDateText: string, nextTime: string) => {
    const parsed = parseDisplayDate(nextDateText);
    const next = parsed
      ? `${format(parsed, ISO_DATE_FORMAT)}T${nextTime || END_OF_DAY_TIME}`
      : nextDateText || nextTime;
    setEmittedValue(next);
    onChange(next);
  };

  /** Fills the time when a date first becomes usable, so the field shows the
   *  end-of-day value that will actually be submitted. */
  const commitDate = (nextDateText: string) => {
    const parsed = parseDisplayDate(nextDateText);
    if (!parsed) {
      emit(nextDateText, timeText);
      return;
    }
    const effectiveTime = timeText || END_OF_DAY_TIME;
    setTimeText(effectiveTime);
    setMonth(parsed);
    emit(nextDateText, effectiveTime);
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = maskDateInput(event.target.value);
    setDateText(nextText);

    // An emptied date means "no expiration", so a leftover time must not stay
    // behind as an incomplete value that blocks submit.
    if (!nextText) {
      setTimeText('');
      emit('', '');
      return;
    }

    commitDate(nextText);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = event.target.value;
    setTimeText(nextTime);
    emit(dateText, nextTime);
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
    <Popover open={open} onOpenChange={setOpen}>
      <InputGroup variant="inline" size="default" className="gap-3">
        <InputGroupInput
          id={fieldId}
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
          aria-label={dateLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
        />
        <InputGroupInput
          id={`${fieldId}-time`}
          type="time"
          variant="inline"
          size="default"
          value={timeText}
          onChange={handleTimeChange}
          disabled={disabled}
          data-empty={timeText ? 'false' : 'true'}
          className={timeSegmentClassName}
          aria-label={timeLabel}
        />
        <InputGroupAddon align="inline-end" className="ml-auto">
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className="focus-visible:ring-stroke-status-focus flex size-5 cursor-pointer items-center justify-center outline-none focus-visible:ring-1 disabled:cursor-not-allowed">
              <IconShell size="sm">
                <CalendarMonth className="text-[length:inherit]" />
              </IconShell>
            </button>
          </PopoverTrigger>
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent
        className="w-auto overflow-hidden border-none p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={event => event.preventDefault()}>
        <Calendar
          mode="single"
          selected={selectedDate}
          month={month}
          onMonthChange={setMonth}
          onSelect={handleCalendarSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
