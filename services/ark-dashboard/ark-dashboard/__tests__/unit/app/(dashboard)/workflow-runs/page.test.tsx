import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import WorkflowRunsPage from '@/app/(dashboard)/workflow-runs/page';

vi.mock('@/components/sections/sessions-section', () => ({
  SessionsSection: ({
    onCountChange,
  }: {
    readonly onCountChange?: (count: number) => void;
  }) => {
    useEffect(() => {
      onCountChange?.(1);
    }, [onCountChange]);

    return <div data-testid="sessions-section">Sessions Section</div>;
  },
}));

describe('WorkflowRunsPage', () => {
  it('should render page header and sessions section', () => {
    render(<WorkflowRunsPage />);

    expect(
      screen.getByRole('heading', { name: 'Workflow runs (1)' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sessions-section')).toBeInTheDocument();
  });
});
