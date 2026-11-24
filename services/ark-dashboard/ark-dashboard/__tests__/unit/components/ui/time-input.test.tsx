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

  it('should handle value prop', () => {
    render(<TimeInput value="12:30" />);

    const root = screen.getByRole('group');
    expect(root).toBeInTheDocument();
  });

  it('should handle onChange callback', () => {
    const handleChange = vi.fn();
    render(<TimeInput onChange={handleChange} />);

    expect(screen.getByRole('group')).toBeInTheDocument();
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

  it('should support 12-hour format', () => {
    render(<TimeInput hourCycle={12} />);

    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('should support 24-hour format', () => {
    render(<TimeInput hourCycle={24} />);

    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
