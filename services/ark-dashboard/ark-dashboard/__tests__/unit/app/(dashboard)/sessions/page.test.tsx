import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionsPage from '@/app/(dashboard)/sessions/page';

const mockUseSearchParams = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header">Page Header</div>,
}));

vi.mock('@/components/sections/sessions-section', () => ({
  SessionsSection: () => <div data-testid="sessions-section">Sessions Section</div>,
}));

const mockUseWorkflows = vi.fn();

vi.mock('@/lib/services/workflows-hooks', () => ({
  useWorkflows: (namespace: string) => mockUseWorkflows(namespace),
}));

vi.mock('@/lib/services/workflow-mapper', () => ({
  mapArgoWorkflowsToSessions: (workflows: unknown[]) => workflows,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkflows.mockReturnValue({ workflows: [] });
  });

  it('should use namespace from URL search params', () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => (key === 'namespace' ? 'test-namespace' : null),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    expect(mockUseWorkflows).toHaveBeenCalledWith('test-namespace');
  });

  it('should use default namespace when not provided in URL', () => {
    mockUseSearchParams.mockReturnValue({
      get: () => null,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    expect(mockUseWorkflows).toHaveBeenCalledWith('default');
  });

  it('should render page header and sessions section', () => {
    mockUseSearchParams.mockReturnValue({
      get: () => null,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionsPage />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('sessions-section')).toBeInTheDocument();
  });
});
