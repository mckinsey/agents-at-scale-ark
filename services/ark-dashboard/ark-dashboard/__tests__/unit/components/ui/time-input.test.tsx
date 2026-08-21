import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TimeInput } from '@/components/ui/time-input';

describe('TimeInput', () => {
  it('should render time input', () => {
    const { container } = render(<TimeInput />);

    expect(container.querySelector('[data-slot="time-input-root"]')).toBeInTheDocument();
  });

  it('should render with default segments', () => {
    const { container } = render(<TimeInput />);

    const segments = container.querySelectorAll('[data-slot="time-segment"]');
    expect(segments.length).toBeGreaterThan(0);
  });

  it('should render the hour and minute it is given', () => {
    const { container } = render(<TimeInput hour={12} minute={30} />);

    const segments = container.querySelectorAll<HTMLInputElement>(
      '[data-slot="time-segment"]',
    );
    expect(segments[0]).toHaveValue('12');
    expect(segments[1]).toHaveValue('30');
  });

  it('should report hour changes', async () => {
    const handleHourChange = vi.fn();
    const { container } = render(
      <TimeInput onHourChange={handleHourChange} />,
    );

    const hourSegment = container.querySelector<HTMLInputElement>(
      '[data-slot="time-segment"]',
    );
    await userEvent.type(hourSegment!, '9');

    expect(handleHourChange).toHaveBeenCalledWith(9);
  });

  it('should handle disabled state', () => {
    const { container } = render(<TimeInput disabled />);

    const root = container.querySelector('[data-slot="time-input-root"]');
    expect(root).toHaveAttribute('data-disabled');
  });

  it('should render clock icon', () => {
    const { container } = render(<TimeInput />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should support different sizes', () => {
    const { container, rerender } = render(<TimeInput size="sm" />);

    expect(container.querySelector('[data-slot="time-input-root"]')).toBeInTheDocument();

    rerender(<TimeInput size="lg" />);

    expect(container.querySelector('[data-slot="time-input-root"]')).toBeInTheDocument();
  });

  it('should handle validation state', () => {
    const { container } = render(<TimeInput validationState="error" />);

    const root = container.querySelector('[data-slot="time-input-root"]');
    expect(root).toHaveAttribute('data-validation', 'error');
  });

  it('should clamp the hour to the bounds derived from min and max', async () => {
    const handleHourChange = vi.fn();
    const { container } = render(
      <TimeInput min="08:00" max="17:00" onHourChange={handleHourChange} />,
    );

    const hourSegment = container.querySelector<HTMLInputElement>(
      '[data-slot="time-segment"]',
    );
    await userEvent.type(hourSegment!, '2');

    expect(handleHourChange).toHaveBeenCalledWith(8);
  });

  it('should render custom placeholders', () => {
    const { container } = render(
      <TimeInput placeholderHour="HH" placeholderMinute="MM" />,
    );

    const segments = container.querySelectorAll<HTMLInputElement>(
      '[data-slot="time-segment"]',
    );
    expect(segments[0]).toHaveAttribute('placeholder', 'HH');
    expect(segments[1]).toHaveAttribute('placeholder', 'MM');
  });
});
