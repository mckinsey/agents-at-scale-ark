'use client';

import {
  format,
  getYear,
  isValid,
  setMonth,
  setYear,
  startOfToday,
} from 'date-fns';
import {
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ComponentProps,
  type HTMLAttributes,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type CalendarMonth,
  type DayButton,
  DayPicker,
  getDefaultClassNames,
  useDayPicker,
} from 'react-day-picker';

import { cn } from '../../lib/utils';
import { ChevronLeft } from '../icons/ChevronLeft';
import { ChevronRight } from '../icons/ChevronRight';
import { Button } from './button';
import { IconShell } from './icon-shell';
import { Input } from './input';

// Constants
const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const DEFAULT_CAPTION_LAYOUT = 'label' as const;

function CalendarDayButton({
  className,
  day,
  modifiers,
  children,
  calendarSize = 'default',
  ...props
}: ComponentProps<typeof DayButton> & {
  calendarSize?: 'default' | 'lg';
}) {
  const defaultClassNames = useMemo(() => getDefaultClassNames(), []);

  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle;

  const isRangeStart = modifiers.range_start;
  const isRangeEnd = modifiers.range_end;
  const isRangeMiddle = modifiers.range_middle;
  const isToday = modifiers.today;
  const isDisabled = modifiers.disabled || modifiers.outside;
  const isFocused = modifiers.focused;

  const typographyClass =
    calendarSize === 'lg' ? 'label-large-primary' : 'label-regular-primary';

  // Organize className styles into logical groups
  const baseStyles = cn(
    typographyClass,
    'cursor-pointer outline-none',
    'relative',
    'flex aspect-square size-auto w-full min-w-(--cell-size)',
    'flex-col items-center justify-center',
    'p-2',
  );

  const defaultStateStyles = 'bg-stateslayer-overlay-enabled text-fg-secondary';

  const hoverStyles = cn(
    'hover:bg-stateslayer-overlay-hover hover:text-fg-primary',
    'hover:data-[disabled=true]:bg-stateslayer-overlay-enabled',
    'hover:data-[disabled=true]:text-fg-disabled',
  );

  const focusedStyles = cn(
    'data-[focused=true]:bg-stateslayer-overlay-active-inverse',
    'data-[focused=true]:text-fg-primary',
    'data-[focused=true]:ring-2',
    'data-[focused=true]:ring-stroke-status-focus',
    'data-[focused=true]:relative',
    'data-[focused=true]:z-10',
  );

  const selectedStyles = cn(
    'data-[selected-single=true]:bg-stateslayer-overlay-active',
    'data-[selected-single=true]:text-fg-primary-inverse',
  );

  const rangeStartStyles = cn(
    'data-[range-start=true]:bg-stateslayer-overlay-active',
    'data-[range-start=true]:text-fg-primary-inverse',
    'data-[range-start=true]:underline',
    'data-[range-start=true]:decoration-solid',
    'data-[range-start=true]:decoration-skip-ink-none',
    'data-[range-start=true]:[text-underline-position:from-font]',
    'data-[range-start=true]:rounded-none',
  );

  const rangeEndStyles = cn(
    'data-[range-end=true]:bg-stateslayer-overlay-active',
    'data-[range-end=true]:text-fg-primary-inverse',
    'data-[range-end=true]:underline',
    'data-[range-end=true]:decoration-solid',
    'data-[range-end=true]:decoration-skip-ink-none',
    'data-[range-end=true]:[text-underline-position:from-font]',
    'data-[range-end=true]:rounded-none',
  );

  const rangeMiddleStyles = cn(
    'data-[range-middle=true]:bg-fill-muted',
    'data-[range-middle=true]:text-fg-primary',
    'data-[range-middle=true]:rounded-none',
  );

  const disabledStyles = cn(
    'data-[disabled=true]:text-fg-disabled',
    'data-[disabled=true]:bg-stateslayer-overlay-enabled',
    'data-[disabled=true]:cursor-not-allowed',
    'disabled:text-fg-disabled',
    'disabled:bg-stateslayer-overlay-enabled',
    'disabled:cursor-not-allowed',
    'disabled:hover:bg-stateslayer-overlay-enabled',
    'disabled:hover:text-fg-disabled',
  );

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      data-day={format(day.date, 'yyyy-MM-dd')}
      data-selected-single={isSelected}
      data-range-start={isRangeStart}
      data-range-end={isRangeEnd}
      data-range-middle={isRangeMiddle}
      data-today={isToday}
      data-focused={isFocused}
      data-disabled={isDisabled}
      className={cn(
        defaultClassNames.day,
        baseStyles,
        defaultStateStyles,
        hoverStyles,
        focusedStyles,
        selectedStyles,
        rangeStartStyles,
        rangeEndStyles,
        rangeMiddleStyles,
        disabledStyles,
        className,
      )}
      {...props}>
      {isToday && (
        <span
          className={cn(
            'bg-fill-active absolute left-1/2 size-1 -translate-x-1/2 rounded-full',
            calendarSize === 'lg' ? 'bottom-2' : 'bottom-1',
            (isSelected || isRangeStart || isRangeEnd) && 'hidden',
          )}
        />
      )}
      {children}
    </button>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  captionLayout = 'label',
  formatters,
  components,
  size = 'default',
  ...props
}: ComponentProps<typeof DayPicker> & {
  size?: 'default' | 'lg';
}) {
  const defaultClassNames = useMemo(() => getDefaultClassNames(), []);
  const currentCaptionLayout = captionLayout || DEFAULT_CAPTION_LAYOUT;

  return (
    <DayPicker
      // Default to single selection like shadcn when mode is not provided
      mode={props.mode ?? 'single'}
      showOutsideDays={showOutsideDays}
      className={cn(
        'bg-fill-active-inverse group/calendar p-4',
        size === 'lg'
          ? '[--cell-size:--spacing(12)]'
          : '[--cell-size:--spacing(10)]',
        'shadow-elevation-1',
        className,
      )}
      captionLayout={currentCaptionLayout}
      formatters={useMemo(
        () => ({
          formatMonthDropdown: (date: Date) => format(date, 'MMM'),
          formatWeekdayName: (date: Date) => format(date, 'EEEEE'),
          ...formatters,
        }),
        [formatters],
      )}
      classNames={useMemo(
        () => ({
          root: cn('w-fit', defaultClassNames.root),
          months: cn(
            'flex gap-12 flex-col md:flex-row relative',
            defaultClassNames.months,
          ),
          month: cn('flex flex-col w-full gap-4', defaultClassNames.month),
          nav: cn(
            'flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between px-1',
            defaultClassNames.nav,
          ),
          month_caption: cn(
            'flex items-center justify-center w-full px-0 uppercase relative z-10',
            size === 'lg' ? 'h-12' : 'h-7',
            defaultClassNames.month_caption,
          ),
          table: 'w-full border-collapse',
          weekdays: cn('flex ', defaultClassNames.weekdays),
          weekday: cn(
            'flex text-fg-secondary flex-1 select-none size-(--cell-size) justify-center items-center',
            size === 'lg' ? 'paragraph-large-primary' : 'label-large-primary',
            defaultClassNames.weekday,
          ),
          week: cn('flex w-full', defaultClassNames.week),
          week_number_header: cn(
            'select-none w-(--cell-size)',
            defaultClassNames.week_number_header,
          ),
          week_number: cn(
            'paragraph-small-primary select-none text-fg-tertiary',
            defaultClassNames.week_number,
          ),
          day: cn(
            'relative w-full h-full p-0 size-(--cell-size) text-center group/day aspect-square select-none',
            defaultClassNames.day,
          ),
          range_start: cn(defaultClassNames.range_start, 'rounded-none'),
          range_middle: cn(defaultClassNames.range_middle, 'rounded-none'),
          range_end: cn(defaultClassNames.range_end, 'rounded-none'),
          today: cn(defaultClassNames.today, 'text-fg-secondary'),
          outside: cn(
            'text-fg-disabled aria-selected:text-fg-disabled',
            defaultClassNames.outside,
          ),
          disabled: cn('text-fg-disabled', defaultClassNames.disabled),
          hidden: cn('invisible', defaultClassNames.hidden),
          ...classNames,
        }),
        [defaultClassNames, classNames, size],
      )}
      components={useMemo(
        () => ({
          DayButton: (dayBtnProps: ComponentProps<typeof DayButton>) => (
            <CalendarDayButton {...dayBtnProps} calendarSize={size} />
          ),
          Root: ({
            rootRef,
            ...rootProps
          }: {
            rootRef?: Ref<HTMLDivElement>;
          } & HTMLAttributes<HTMLDivElement>) => {
            return <div data-slot="calendar" ref={rootRef} {...rootProps} />;
          },
          NextMonthButton: (
            btnProps: ButtonHTMLAttributes<HTMLButtonElement>,
          ) => {
            const { className: btnClassName, ...restProps } = btnProps;
            return (
              <Button
                variant="ghost"
                size={size === 'lg' ? 'icon-lg' : 'icon-sm'}
                className={cn('z-20', btnClassName)}
                {...restProps}>
                <IconShell>
                  <ChevronRight className="text-[length:inherit]" />
                </IconShell>
              </Button>
            );
          },
          PreviousMonthButton: (
            btnProps: ButtonHTMLAttributes<HTMLButtonElement>,
          ) => {
            const { className: btnClassName, ...restProps } = btnProps;
            return (
              <Button
                variant="ghost"
                size={size === 'lg' ? 'icon-lg' : 'icon-sm'}
                className={cn('z-20', btnClassName)}
                {...restProps}>
                <IconShell>
                  <ChevronLeft className="text-[length:inherit]" />
                </IconShell>
              </Button>
            );
          },
          WeekNumber: ({ children, ...weekNumProps }) => {
            return (
              <td {...weekNumProps}>
                <div className="flex size-(--cell-size) items-center justify-center text-center">
                  {children}
                </div>
              </td>
            );
          },
          MonthCaption: (
            captionProps: {
              /** The month to display in the caption. */
              calendarMonth: CalendarMonth;
              /** The index of the month being displayed. Kept to prevent invalid HTML arguments from being passed to DOM elements. */
              displayIndex: number;
            } & HTMLAttributes<HTMLDivElement>,
          ) => {
            const {
              calendarMonth,
              displayIndex: _displayIndex,
              children,
              className: captionClassName,
              ...divProps
            } = captionProps;
            const { goToMonth } = useDayPicker();
            const displayMonth = calendarMonth?.date;
            const validMonth = isValid(displayMonth)
              ? displayMonth
              : startOfToday();

            const [monthValue, setMonthValue] = useState(() =>
              format(validMonth, 'MMM').toUpperCase(),
            );
            const [yearValue, setYearValue] = useState(() =>
              getYear(validMonth).toString(),
            );

            useEffect(() => {
              if (isValid(displayMonth)) {
                setMonthValue(format(displayMonth, 'MMM').toUpperCase());
                setYearValue(getYear(displayMonth).toString());
              }
            }, [displayMonth]);

            const handleMonthInputChange = (
              e: ChangeEvent<HTMLInputElement>,
            ) => {
              const value = e.target.value.toUpperCase();
              setMonthValue(value);

              const monthIndex = MONTH_NAMES.indexOf(
                value as (typeof MONTH_NAMES)[number],
              );

              if (monthIndex >= 0 && isValid(displayMonth)) {
                const newDate = setMonth(displayMonth, monthIndex);
                goToMonth(newDate);
              }
            };

            const handleYearInputChange = (
              e: ChangeEvent<HTMLInputElement>,
            ) => {
              const value = e.target.value;

              if (/^\d{0,4}$/.test(value)) {
                setYearValue(value);

                if (value.length === 4) {
                  const year = Number.parseInt(value, 10);

                  if (year >= 1000 && year <= 9999 && isValid(displayMonth)) {
                    const newDate = setYear(displayMonth, year);
                    goToMonth(newDate);
                  }
                }
              }
            };

            // If captionLayout is dropdown, render children (dropdown controls)
            if (currentCaptionLayout.startsWith('dropdown')) {
              return (
                <div className={cn(captionClassName)} {...divProps}>
                  {children}
                </div>
              );
            }

            const inputTypography =
              size === 'lg'
                ? 'paragraph-large-primary'
                : 'paragraph-regular-primary';

            const separatorTypography =
              size === 'lg' ? 'label-large-primary' : 'label-regular-primary';

            // Otherwise render custom inputs
            return (
              <div className={cn(captionClassName)} {...divProps}>
                <div className="relative z-10 flex h-full items-center justify-center gap-1 px-0">
                  <Input
                    variant="inline"
                    value={monthValue}
                    onChange={handleMonthInputChange}
                    className={cn(
                      inputTypography,
                      'text-fg-primary pointer-events-auto h-full p-0 text-center uppercase',
                      size === 'lg' ? 'w-10' : 'w-9',
                    )}
                    maxLength={3}
                  />

                  <span className={cn(separatorTypography, 'text-fg-tertiary')}>
                    /
                  </span>

                  <Input
                    variant="inline"
                    value={yearValue}
                    onChange={handleYearInputChange}
                    className={cn(
                      inputTypography,
                      'text-fg-primary pointer-events-auto h-full p-0 text-center',
                      size === 'lg' ? 'w-10' : 'w-9',
                    )}
                    maxLength={4}
                  />
                </div>
              </div>
            );
          },
          CaptionLabel: () => {
            return <span />;
          },
          ...components,
        }),
        [size, currentCaptionLayout, components],
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
