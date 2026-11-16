import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkflowRunsPage from '@/app/(dashboard)/workflow-runs/page';
import { useGetSystemInfo } from '@/lib/services/system-info-hooks';

const reportedCount = vi.hoisted(() => ({ value: 1 as number | null }));

vi.mock('@/lib/services/system-info-hooks', () => ({
  useGetSystemInfo: vi.fn(),
}));

const mockUseGetSystemInfo = vi.mocked(useGetSystemInfo);

vi.mock('@/components/sections/sessions-section', () => ({
  SessionsSection: ({
    onCountChange,
  }: {
    readonly onCountChange?: (count: number | null) => void;
  }) => {
    useEffect(() => {
      onCountChange?.(reportedCount.value);
    }, [onCountChange]);

    return <div data-testid="sessions-section">Sessions Section</div>;
  },
}));

describe('WorkflowRunsPage', () => {
  beforeEach(() => {
    reportedCount.value = 1;
    mockUseGetSystemInfo.mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useGetSystemInfo>);
  });

  it('should render page header and sessions section', () => {
    render(<WorkflowRunsPage />);

    expect(
      screen.getByRole('heading', { name: 'Workflow runs (1)' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sessions-section')).toBeInTheDocument();
  });

  it('should render the Argo Server URL alert', () => {
    mockUseGetSystemInfo.mockReturnValue({
      data: { argo_server_configured: false },
    } as ReturnType<typeof useGetSystemInfo>);

    render(<WorkflowRunsPage />);

    expect(
      screen.getByTestId('argo-server-url-missing-alert'),
    ).toBeInTheDocument();
  });

  it('should show the total count reported by the sessions section', () => {
    reportedCount.value = 137;
    render(<WorkflowRunsPage />);

    expect(
      screen.getByRole('heading', { name: 'Workflow runs (137)' }),
    ).toBeInTheDocument();
  });

  it('should show no count when the total is unknown', () => {
    reportedCount.value = null;
    render(<WorkflowRunsPage />);

    expect(
      screen.getByRole('heading', { name: 'Workflow runs' }),
    ).toBeInTheDocument();
  });
});
