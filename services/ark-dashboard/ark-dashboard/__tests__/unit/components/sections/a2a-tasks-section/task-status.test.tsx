import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskStatus } from '@/components/sections/a2a-tasks-section/task-status';

describe('TaskStatus', () => {
  it.each([
    { phase: 'completed', label: 'Completed' },
    { phase: 'running', label: 'Running' },
    { phase: 'failed', label: 'Failed' },
    { phase: 'pending', label: 'Pending' },
    { phase: 'input-required', label: 'Input required' },
    { phase: 'cancelled', label: 'Cancelled' },
  ])('renders the "$label" label for phase "$phase"', ({ phase, label }) => {
    render(<TaskStatus phase={phase} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('falls back to Unknown for a missing phase', () => {
    render(<TaskStatus />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('exposes the status to assistive tech rather than colour alone', () => {
    render(<TaskStatus phase="failed" />);
    expect(screen.getByRole('img', { name: 'Failed' })).toBeInTheDocument();
  });
});
