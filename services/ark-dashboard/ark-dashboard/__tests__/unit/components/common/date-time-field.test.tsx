import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, isSameDay, startOfDay, startOfMonth } from 'date-fns';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DateTimeField } from '@/components/common/date-time-field';

interface HarnessProps {
  readonly initialValue?: string;
  readonly onChangeSpy?: (value: string) => void;
}

/** DateTimeField is controlled, so typing needs a parent that stores the value.
 *  The trailing button gives focus somewhere outside the field to land on. */
function Harness({ initialValue = '', onChangeSpy }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <DateTimeField
        value={value}
        onChange={next => {
          setValue(next);
          onChangeSpy?.(next);
        }}
      />
      <button type="button">outside</button>
    </>
  );
}

const dateInput = () => screen.getByLabelText('Date');
const hourInput = () => screen.getByLabelText('Hour');
const minuteInput = () => screen.getByLabelText('Minute');
const outside = () => screen.getByRole('button', { name: 'outside' });
const lastCall = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.at(-1)?.[0] as string;

describe('DateTimeField', () => {
  it('renders empty with a dd/mm/yyyy placeholder and a calendar trigger', () => {
    render(<Harness />);

    expect(dateInput()).toHaveAttribute('placeholder', 'dd/mm/yyyy');
    expect(dateInput()).toHaveValue('');
    expect(hourInput()).toHaveAttribute('placeholder', '--');
    expect(minuteInput()).toHaveAttribute('placeholder', '--');
    expect(hourInput()).toHaveValue('');
    expect(minuteInput()).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Open calendar' }),
    ).toBeInTheDocument();
  });

  it('inserts separators as digits are typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(dateInput(), '2408');
    expect(dateInput()).toHaveValue('24/08');
  });

  it('defaults a dateless time to end of day and shows it', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(dateInput(), '24082026');

    expect(lastCall(onChangeSpy)).toBe('2026-08-24T23:59');
    expect(hourInput()).toHaveValue('23');
    expect(minuteInput()).toHaveValue('59');
  });

  it('keeps a time entered before a date and combines it once the date lands', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(hourInput(), '14');
    await user.type(minuteInput(), '30');
    expect(hourInput()).toHaveValue('14');
    expect(minuteInput()).toHaveValue('30');

    await user.type(dateInput(), '24082026');
    expect(lastCall(onChangeSpy)).toBe('2026-08-24T14:30');
  });

  it('mirrors an incomplete date so the form can reject it', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(dateInput(), '2408202');

    expect(dateInput()).toHaveValue('24/08/202');
    expect(lastCall(onChangeSpy)).toBe('24/08/202');
  });

  it('mirrors an impossible date rather than rolling it over', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    await user.type(dateInput(), '31022026');

    expect(lastCall(onChangeSpy)).toBe('31/02/2026');
  });

  it('clears the value when the date is emptied', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness initialValue="2026-08-24T14:30" onChangeSpy={onChangeSpy} />,
    );

    await user.clear(dateInput());

    expect(lastCall(onChangeSpy)).toBe('');
    expect(hourInput()).toHaveValue('');
    expect(minuteInput()).toHaveValue('');
  });

  it('renders an initial value in display format', () => {
    render(<Harness initialValue="2026-08-24T14:30" />);

    expect(dateInput()).toHaveValue('24/08/2026');
    expect(hourInput()).toHaveValue('14');
    expect(minuteInput()).toHaveValue('30');
  });

  it('adopts a value replaced from outside', () => {
    const { rerender } = render(
      <DateTimeField value="2026-08-24T14:30" onChange={vi.fn()} />,
    );
    expect(dateInput()).toHaveValue('24/08/2026');

    rerender(<DateTimeField value="" onChange={vi.fn()} />);

    expect(dateInput()).toHaveValue('');
    expect(hourInput()).toHaveValue('');
    expect(minuteInput()).toHaveValue('');
  });

  it('forwards the id and aria wiring supplied by FormControl', () => {
    render(
      <DateTimeField
        id="expiry"
        value=""
        onChange={vi.fn()}
        aria-describedby="expiry-help"
        aria-invalid={true}
      />,
    );

    expect(dateInput()).toHaveAttribute('id', 'expiry');
    expect(hourInput()).toHaveAttribute('id', 'expiry-hour');
    expect(minuteInput()).toHaveAttribute('id', 'expiry-minute');

    for (const input of [dateInput(), hourInput(), minuteInput()]) {
      expect(input).toHaveAttribute('aria-describedby', 'expiry-help');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('disables both segments and the calendar trigger', () => {
    render(<DateTimeField value="" onChange={vi.fn()} disabled />);

    expect(dateInput()).toBeDisabled();
    expect(hourInput()).toBeDisabled();
    expect(minuteInput()).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Open calendar' }),
    ).toBeDisabled();
  });

  it('names the whole field through the group, not the date segment', () => {
    render(
      <>
        <span id="expiry-label">Expires at</span>
        <DateTimeField
          value=""
          onChange={vi.fn()}
          aria-labelledby="expiry-label"
        />
      </>,
    );

    expect(screen.getByRole('group')).toHaveAccessibleName('Expires at');
    expect(dateInput()).toHaveAccessibleName('Date');
  });

  it('forwards a ref to the date segment so the form can focus it', () => {
    const ref = createRef<HTMLInputElement>();
    render(<DateTimeField ref={ref} value="" onChange={vi.fn()} />);

    expect(ref.current).toBe(dateInput());
  });

  it('fills a cleared hour on blur instead of submitting a time it is not showing', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness initialValue="2026-08-24T14:30" onChangeSpy={onChangeSpy} />,
    );

    await user.type(hourInput(), '{backspace}');
    expect(hourInput()).toHaveValue('');

    await user.click(outside());

    expect(hourInput()).toHaveValue('23');
    expect(minuteInput()).toHaveValue('30');
    expect(lastCall(onChangeSpy)).toBe('2026-08-24T23:30');
  });

  it('fills a cleared minute on blur and keeps the typed hour', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness initialValue="2026-08-24T14:30" onChangeSpy={onChangeSpy} />,
    );

    await user.type(minuteInput(), '{backspace}');
    await user.click(outside());

    expect(hourInput()).toHaveValue('14');
    expect(minuteInput()).toHaveValue('59');
    expect(lastCall(onChangeSpy)).toBe('2026-08-24T14:59');
  });

  it('clears both halves together so no partial time is left behind', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness initialValue="2026-08-24T14:30" onChangeSpy={onChangeSpy} />,
    );

    await user.type(hourInput(), '{backspace}');
    await user.type(minuteInput(), '{backspace}');
    await user.click(outside());

    expect(hourInput()).toHaveValue('23');
    expect(minuteInput()).toHaveValue('59');
    expect(lastCall(onChangeSpy)).toBe('2026-08-24T23:59');
  });

  it('overwrites in place when a digit is typed into a complete date', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness initialValue="2026-08-24T14:30" onChangeSpy={onChangeSpy} />,
    );

    await user.type(dateInput(), '1', {
      initialSelectionStart: 2,
      initialSelectionEnd: 2,
    });

    expect(dateInput()).toHaveValue('24/18/2026');
    expect(lastCall(onChangeSpy)).toBe('24/18/2026');
    expect(dateInput()).toHaveFocus();
    expect((dateInput() as HTMLInputElement).selectionStart).toBe(4);
  });

  it('disables days before today in the calendar', async () => {
    const user = userEvent.setup();
    render(<DateTimeField value="" onChange={vi.fn()} />);

    screen.getByRole('button', { name: 'Open calendar' }).focus();
    await user.keyboard('{Enter}');

    const dayButton = (date: Date) =>
      document.querySelector(
        `button[data-day="${format(date, 'yyyy-MM-dd')}"]`,
      );

    const today = startOfDay(new Date());
    await waitFor(() => expect(dayButton(today)).toBeTruthy());

    expect(dayButton(today)).toBeEnabled();

    const firstOfMonth = startOfMonth(today);
    if (!isSameDay(firstOfMonth, today)) {
      expect(dayButton(firstOfMonth)).toBeDisabled();
    }
  });
});
