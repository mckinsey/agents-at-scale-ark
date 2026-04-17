'use client';

import { format, isValid, parse } from 'date-fns';
import * as React from 'react';
import type {
  DateRange,
  DayEventHandler,
  OnSelectHandler,
} from 'react-day-picker';

import { ArrowForward } from '@/components/icons/ArrowForward';
import { CalendarMonth } from '@/components/icons/CalendarMonth';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const dateSegmentFocusClassName = cn(
  '[&::-webkit-datetime-edit-day-field:focus]:bg-fill-active',
  '[&::-webkit-datetime-edit-day-field:focus]:text-fg-primary-inverse',
  '[&::-webkit-datetime-edit-day-field:focus]:rounded-none',
  '[&::-webkit-datetime-edit-day-field:focus]:outline-none',
  '[&::-webkit-datetime-edit-month-field:focus]:bg-fill-active',
  '[&::-webkit-datetime-edit-month-field:focus]:text-fg-primary-inverse',
  '[&::-webkit-datetime-edit-month-field:focus]:rounded-none',
  '[&::-webkit-datetime-edit-month-field:focus]:outline-none',
  '[&::-webkit-datetime-edit-year-field:focus]:bg-fill-active',
  '[&::-webkit-datetime-edit-year-field:focus]:text-fg-primary-inverse',
  '[&::-webkit-datetime-edit-year-field:focus]:rounded-none',
  '[&::-webkit-datetime-edit-year-field:focus]:outline-none',
);

const dateInputClassName = cn(
  'w-auto min-w-0 cursor-pointer',
  '[&::-webkit-calendar-picker-indicator]:hidden',
  '[&::-webkit-calendar-picker-indicator]:appearance-none',
  'data-[empty=true]:text-fg-tertiary',
  'data-[empty=true]:focus:text-fg-primary',
  'data-[empty=false]:text-fg-primary',
  dateSegmentFocusClassName,
);

// ============================================================================
// Shared Hooks
// ============================================================================

function useDatePicker() {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [dateValue, setDateValue] = React.useState('');
  const [month, setMonth] = React.useState<Date | undefined>(undefined);

  React.useEffect(() => {
    setDateValue(date ? format(date, 'yyyy-MM-dd') : '');

    if (date) {
      setMonth(date);
    }
  }, [date]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDateValue(text);

    if (!text) {
      setDate(undefined);
      return;
    }

    const parsedDate = parse(text, 'yyyy-MM-dd', new Date());

    if (isValid(parsedDate)) {
      setDate(parsedDate);
      setMonth(parsedDate);
    } else {
      setDate(undefined);
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    setOpen(false);
  };

  return {
    open,
    setOpen,
    date,
    dateValue,
    month,
    setMonth,
    handleInputChange,
    handleCalendarSelect,
  };
}

function useDateRangePicker() {
  const [open, setOpen] = React.useState(false);
  const [range, setRange] = React.useState<DateRange | undefined>(undefined);
  const [startDateValue, setStartDateValue] = React.useState('');
  const [endDateValue, setEndDateValue] = React.useState('');
  const [month, setMonth] = React.useState<Date | undefined>(undefined);

  React.useEffect(() => {
    setStartDateValue(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
    setEndDateValue(range?.to ? format(range.to, 'yyyy-MM-dd') : '');

    if (range?.from) {
      setMonth(range.from);
    } else if (range?.to) {
      setMonth(range.to);
    }
  }, [range]);

  const updateField = (
    prevRange: DateRange | undefined,
    field: 'from' | 'to',
    value: Date | undefined,
  ): DateRange | undefined => ({
    from: field === 'from' ? value : prevRange?.from,
    to: field === 'to' ? value : prevRange?.to,
  });

  const createInputChangeHandler = (
    field: 'from' | 'to',
    setValue: (value: string) => void,
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setValue(text);

      if (!text) {
        setRange(prev => updateField(prev, field, undefined));
        return;
      }

      const parsedDate = parse(text, 'yyyy-MM-dd', new Date());

      if (isValid(parsedDate)) {
        setRange(prev => updateField(prev, field, parsedDate));
        setMonth(parsedDate);
      } else {
        setRange(prev => updateField(prev, field, undefined));
      }
    };
  };

  const handleStartInputChange = createInputChangeHandler(
    'from',
    setStartDateValue,
  );
  const handleEndInputChange = createInputChangeHandler('to', setEndDateValue);

  const handleSelect: OnSelectHandler<
    DateRange | undefined
  > = selectedRange => {
    if (range?.from && !range.to) {
      setRange(selectedRange);
    }
  };

  const handleDayClick: DayEventHandler<React.MouseEvent> = day => {
    if (range?.from && !range.to) {
      return;
    }
    setRange({ from: day });
  };

  return {
    open,
    setOpen,
    startDateValue,
    endDateValue,
    month,
    setMonth,
    range,
    handleStartInputChange,
    handleEndInputChange,
    handleSelect,
    handleDayClick,
  };
}

// ============================================================================
// Example Components (New Format)
// ============================================================================

/**
 * Single date picker with input
 */
export function DatePickerDemo() {
  const {
    open,
    setOpen,
    date,
    dateValue,
    month,
    setMonth,
    handleInputChange,
    handleCalendarSelect,
  } = useDatePicker();

  return (
    <Field className="w-[196px] gap-2">
      <FieldLabel htmlFor="date-input" className="label-regular-primary">
        Select Date
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <InputGroup data-open={open} className="cursor-pointer">
            <InputGroupInput
              id="date-input"
              type="date"
              value={dateValue}
              onChange={handleInputChange}
              data-empty={dateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label="Date"
            />
            <InputGroupAddon align="inline-end">
              <span className="flex size-5 cursor-pointer items-center justify-center">
                <IconShell size="sm">
                  <CalendarMonth className="text-[length:inherit]" />
                </IconShell>
              </span>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-none p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={date}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleCalendarSelect}
          />
        </PopoverContent>
      </Popover>

      <FieldDescription>Helper text</FieldDescription>
    </Field>
  );
}

/**
 * Date range picker with inputs
 */
export function DatePickerRange() {
  const {
    open,
    setOpen,
    startDateValue,
    endDateValue,
    month,
    setMonth,
    range,
    handleStartInputChange,
    handleEndInputChange,
    handleSelect,
    handleDayClick,
  } = useDateRangePicker();

  return (
    <Field className="w-[240px] gap-2">
      <FieldLabel htmlFor="date-range-start" className="label-regular-primary">
        Date Range
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <InputGroup data-open={open} className="cursor-pointer">
            <InputGroupInput
              id="date-range-start"
              type="date"
              value={startDateValue}
              onChange={handleStartInputChange}
              data-empty={startDateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label="Start date"
            />
            <InputGroupAddon className="order-none">
              <InputGroupText>
                <ArrowForward className="text-[length:inherit]" />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="date-range-end"
              type="date"
              value={endDateValue}
              onChange={handleEndInputChange}
              data-empty={endDateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label="End date"
            />
            <InputGroupAddon align="inline-end">
              <span className="flex size-5 cursor-pointer items-center justify-center">
                <IconShell size="sm">
                  <CalendarMonth className="text-[length:inherit]" />
                </IconShell>
              </span>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-none p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleSelect}
            onDayClick={handleDayClick}
          />
        </PopoverContent>
      </Popover>

      <FieldDescription>Helper text</FieldDescription>
    </Field>
  );
}

/**
 * Disabled date picker
 */
export function DatePickerDisabled() {
  return (
    <Field className="w-[196px] gap-2">
      <FieldLabel
        htmlFor="date-input-disabled"
        className="label-regular-primary">
        Select Date
      </FieldLabel>

      <InputGroup className="cursor-not-allowed">
        <InputGroupInput
          id="date-input-disabled"
          type="date"
          value=""
          disabled
          data-empty="true"
          className={dateInputClassName}
          aria-label="Date"
        />
        <InputGroupAddon align="inline-end">
          <span className="flex size-5 cursor-not-allowed items-center justify-center">
            <IconShell size="sm">
              <CalendarMonth className="text-[length:inherit]" />
            </IconShell>
          </span>
        </InputGroupAddon>
      </InputGroup>

      <FieldDescription>Helper text</FieldDescription>
    </Field>
  );
}

/**
 * Single sized date picker — extracted to avoid hooks in callbacks
 */
function DatePickerSized({
  size,
  variant = 'default',
  label,
  labelClass,
  descriptionClass,
  containerClass,
}: Readonly<{
  size: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'inline';
  label: string;
  labelClass: string;
  descriptionClass?: string;
  containerClass?: string;
}>) {
  const {
    open,
    setOpen,
    date,
    dateValue,
    month,
    setMonth,
    handleInputChange,
    handleCalendarSelect,
  } = useDatePicker();

  return (
    <Field className={cn('gap-2', containerClass)}>
      <FieldLabel
        htmlFor={`date-size-${variant}-${size}`}
        className={labelClass}>
        {label}
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <InputGroup
            variant={variant}
            size={size}
            data-open={open}
            className="cursor-pointer">
            <InputGroupInput
              id={`date-size-${variant}-${size}`}
              type="date"
              variant={variant}
              size={size}
              value={dateValue}
              onChange={handleInputChange}
              data-empty={dateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label={`${label} date`}
            />
            <InputGroupAddon align="inline-end">
              <span
                className={cn(
                  'flex cursor-pointer items-center justify-center',
                )}>
                <IconShell size={size === 'lg' ? 'default' : 'sm'}>
                  <CalendarMonth className="text-[length:inherit]" />
                </IconShell>
              </span>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-none p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}>
          <Calendar
            mode="single"
            size={size === 'lg' ? 'lg' : 'default'}
            selected={date}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleCalendarSelect}
          />
        </PopoverContent>
      </Popover>

      <FieldDescription className={descriptionClass}>
        Helper text
      </FieldDescription>
    </Field>
  );
}

/**
 * Date picker sizes — sm, default, lg
 */
export function DatePickerSizes() {
  return (
    <div className="flex flex-col gap-6">
      <DatePickerSized
        size="sm"
        label="Small"
        labelClass="label-small-primary"
        descriptionClass="paragraph-small-primary"
        containerClass="w-[196px]"
      />
      <DatePickerSized
        size="default"
        label="Default"
        labelClass="label-regular-primary"
        containerClass="w-[196px]"
      />
      <DatePickerSized
        size="lg"
        label="Large"
        labelClass="label-large-primary"
        containerClass="w-[196px]"
      />
    </div>
  );
}

/**
 * Inline variant date picker sizes — sm, default, lg
 */
export function DatePickerInlineSizes() {
  return (
    <div className="flex flex-col gap-6">
      <DatePickerSized
        variant="inline"
        size="sm"
        label="Small"
        labelClass="label-small-primary"
        descriptionClass="paragraph-small-primary"
        containerClass="w-[196px]"
      />
      <DatePickerSized
        variant="inline"
        size="default"
        label="Default"
        labelClass="label-regular-primary mb-[-4px]"
        containerClass="w-[196px]"
      />
      <DatePickerSized
        variant="inline"
        size="lg"
        label="Large"
        labelClass="label-large-primary mb-[-4px]"
        containerClass="w-[196px]"
      />
    </div>
  );
}

/**
 * Single validation date picker with calendar
 */
function DatePickerValidationItem({
  id,
  label,
  message,
  messageClass,
  borderClass,
  isError,
}: Readonly<{
  id: string;
  label: string;
  message: string;
  messageClass: string;
  borderClass: string;
  isError: boolean;
}>) {
  const {
    open,
    setOpen,
    date,
    dateValue,
    month,
    setMonth,
    handleInputChange,
    handleCalendarSelect,
  } = useDatePicker();

  return (
    <Field className="w-[196px] gap-2">
      <FieldLabel htmlFor={`date-${id}`} className="label-regular-primary">
        {label}
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <InputGroup
            data-open={open}
            className={cn('cursor-pointer', borderClass)}>
            <InputGroupInput
              id={`date-${id}`}
              type="date"
              value={dateValue}
              onChange={handleInputChange}
              data-empty={dateValue ? 'false' : 'true'}
              aria-invalid={isError}
              className={dateInputClassName}
              aria-label={`${label} date`}
            />
            <InputGroupAddon align="inline-end">
              <span className="flex size-5 cursor-pointer items-center justify-center">
                <IconShell size="sm">
                  <CalendarMonth className="text-[length:inherit]" />
                </IconShell>
              </span>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-none p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}>
          <Calendar
            mode="single"
            selected={date}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleCalendarSelect}
          />
        </PopoverContent>
      </Popover>

      <FieldDescription className={messageClass}>{message}</FieldDescription>
    </Field>
  );
}

/**
 * Date picker with validation states — error, warning, success
 */
export function DatePickerValidation() {
  return (
    <div className="flex flex-col gap-6">
      <DatePickerValidationItem
        id="error"
        label="Error"
        message="Feedback message here"
        messageClass="text-status-error"
        borderClass=""
        isError
      />
      <DatePickerValidationItem
        id="warning"
        label="Warning"
        message="Feedback message here"
        messageClass="text-status-warning"
        borderClass="border border-status-warning"
        isError={false}
      />
      <DatePickerValidationItem
        id="success"
        label="Success"
        message="Feedback message here"
        messageClass="text-status-success"
        borderClass="border border-status-success"
        isError={false}
      />
    </div>
  );
}

/**
 * Inline variant date range picker
 */
export function DatePickerRangeInline() {
  const {
    open,
    setOpen,
    startDateValue,
    endDateValue,
    month,
    setMonth,
    range,
    handleStartInputChange,
    handleEndInputChange,
    handleSelect,
    handleDayClick,
  } = useDateRangePicker();

  return (
    <Field className="w-[240px] gap-2">
      <FieldLabel
        htmlFor="date-range-inline-start"
        className="label-regular-primary mb-[-4px]">
        Date Range
      </FieldLabel>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <InputGroup
            variant="inline"
            data-open={open}
            className="cursor-pointer">
            <InputGroupInput
              id="date-range-inline-start"
              type="date"
              variant="inline"
              value={startDateValue}
              onChange={handleStartInputChange}
              data-empty={startDateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label="Start date"
            />
            <InputGroupAddon className="order-none">
              <InputGroupText>
                <ArrowForward className="text-[length:inherit]" />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="date-range-inline-end"
              type="date"
              variant="inline"
              value={endDateValue}
              onChange={handleEndInputChange}
              data-empty={endDateValue ? 'false' : 'true'}
              className={dateInputClassName}
              aria-label="End date"
            />
            <InputGroupAddon align="inline-end">
              <span className="flex size-5 cursor-pointer items-center justify-center">
                <IconShell size="sm">
                  <CalendarMonth className="text-[length:inherit]" />
                </IconShell>
              </span>
            </InputGroupAddon>
          </InputGroup>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-none p-0"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={e => e.preventDefault()}>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            month={month}
            onMonthChange={setMonth}
            onSelect={handleSelect}
            onDayClick={handleDayClick}
          />
        </PopoverContent>
      </Popover>

      <FieldDescription>Helper text</FieldDescription>
    </Field>
  );
}

// ============================================================================
// Example Metadata
// ============================================================================

export const examples = [
  {
    name: 'DatePickerDemo',
    title: 'Single Date',
    description: 'Date picker with input field and calendar popup.',
  },
  {
    name: 'DatePickerRange',
    title: 'Date Range',
    description: 'Date range picker with start and end date inputs.',
  },
  {
    name: 'DatePickerSizes',
    title: 'Sizes',
    description: 'Date picker in small, default, and large sizes.',
  },
  {
    name: 'DatePickerInlineSizes',
    title: 'Inline Sizes',
    description: 'Inline date picker in small, default, and large sizes.',
  },
  {
    name: 'DatePickerRangeInline',
    title: 'Range Inline',
    description: 'Date range picker with inline variant.',
  },
  {
    name: 'DatePickerValidation',
    title: 'Validation',
    description: 'Date picker with error, warning, and success states.',
  },
  {
    name: 'DatePickerDisabled',
    title: 'Disabled',
    description: 'Date picker in a disabled state.',
  },
];

// ============================================================================
// Legacy Format (for backwards compatibility)
// ============================================================================

export const datePicker = {
  name: 'date-picker',
  components: {
    'Single Date': <DatePickerDemo />,
    'Date Range': <DatePickerRange />,
    Sizes: <DatePickerSizes />,
    'Inline Sizes': <DatePickerInlineSizes />,
    'Range Inline': <DatePickerRangeInline />,
    Validation: <DatePickerValidation />,
    Disabled: <DatePickerDisabled />,
  },
};
