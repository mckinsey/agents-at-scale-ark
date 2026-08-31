import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DateTimeField } from '@/components/common/date-time-field';

interface HarnessProps {
  readonly initialValue?: string;
  readonly onChangeSpy?: (value: string) => void;
}

/** DateTimeField is controlled, so typing needs a parent that stores the value. */
function Harness({ initialValue = '', onChangeSpy }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <DateTimeField
      value={value}
      onChange={next => {
        setValue(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

const dateInput = () => screen.getByLabelText('Date');
const timeInput = () => screen.getByLabelText('Time');
const lastCall = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.at(-1)?.[0] as string;

describe('DateTimeField', () => {
  it('renders empty with a dd/mm/yyyy placeholder and a calendar trigger', () => {
    render(<Harness />);

    expect(dateInput()).toHaveAttribute('placeholder', 'dd/mm/yyyy');
    expect(dateInput()).toHaveValue('');
    expect(timeInput()).toHaveValue('');
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
    expect(timeInput()).toHaveValue('23:59');
  });

  it('keeps a time entered before a date and combines it once the date lands', async () => {
    const onChangeSpy = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChangeSpy={onChangeSpy} />);

    fireEvent.change(timeInput(), { target: { value: '14:30' } });
    expect(timeInput()).toHaveValue('14:30');

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
  });

  it('renders an initial value in display format', () => {
    render(<Harness initialValue="2026-08-24T14:30" />);

    expect(dateInput()).toHaveValue('24/08/2026');
    expect(timeInput()).toHaveValue('14:30');
  });

  it('adopts a value replaced from outside', () => {
    const { rerender } = render(
      <DateTimeField value="2026-08-24T14:30" onChange={vi.fn()} />,
    );
    expect(dateInput()).toHaveValue('24/08/2026');

    rerender(<DateTimeField value="" onChange={vi.fn()} />);

    expect(dateInput()).toHaveValue('');
    expect(timeInput()).toHaveValue('');
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
    expect(dateInput()).toHaveAttribute('aria-describedby', 'expiry-help');
    expect(dateInput()).toHaveAttribute('aria-invalid', 'true');
    expect(timeInput()).toHaveAttribute('id', 'expiry-time');
  });

  it('disables both segments and the calendar trigger', () => {
    render(<DateTimeField value="" onChange={vi.fn()} disabled />);

    expect(dateInput()).toBeDisabled();
    expect(timeInput()).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Open calendar' }),
    ).toBeDisabled();
  });
});
