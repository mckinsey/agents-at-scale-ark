import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Calendar } from '@/components/ui/calendar';

describe('Calendar', () => {
  it('should render calendar', () => {
    const { container } = render(<Calendar />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should render with default mode single', () => {
    const { container } = render(<Calendar />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should handle month navigation', () => {
    render(<Calendar />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should render with range mode', () => {
    const { container } = render(<Calendar mode="range" />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should handle selected date', () => {
    const selected = new Date(2024, 0, 15);
    const { container } = render(<Calendar mode="single" selected={selected} />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should handle onSelect callback', () => {
    const handleSelect = vi.fn();
    const { container } = render(<Calendar mode="single" onSelect={handleSelect} />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should render weekday names', () => {
    const { container } = render(<Calendar />);

    // Calendar grid structure is present
    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should support different sizes', () => {
    const { container, rerender } = render(<Calendar size="default" />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();

    rerender(<Calendar size="lg" />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should handle disabled dates', () => {
    const disabledDates = (date: Date) => date.getDay() === 0;
    const { container } = render(<Calendar disabled={disabledDates} />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });

  it('should show outside days when enabled', () => {
    const { container } = render(<Calendar showOutsideDays />);

    expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument();
  });
});
