import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusDot } from '@/components/sections/a2a-tasks-section/status-dot';

describe('StatusDot', () => {
  it('renders completed variant correctly', () => {
    render(<StatusDot variant="completed" />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-green-300');
  });

  it('renders failed variant correctly', () => {
    render(<StatusDot variant="failed" />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-red-300');
  });

  it('renders running variant correctly', () => {
    render(<StatusDot variant="running" />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-blue-300');
  });

  it('renders pending variant correctly', () => {
    render(<StatusDot variant="pending" />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-yellow-300');
  });

  it('renders unknown variant correctly', () => {
    render(<StatusDot variant="unknown" />);
    const dot = screen.getByTestId('status-dot');
    expect(dot).toHaveClass('bg-gray-300');
  });
});
