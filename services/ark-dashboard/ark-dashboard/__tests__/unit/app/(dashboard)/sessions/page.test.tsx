import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionsPage from '@/app/(dashboard)/sessions/page';

const mockUseNamespace = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header">Page Header</div>,
}));

vi.mock('@/components/sections/sessions-section', () => ({
  SessionsSection: () => (
    <div data-testid="sessions-section">Sessions Section</div>
  ),
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

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <SessionsPage />
    </QueryClientProvider>,
  );

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkflows.mockReturnValue({ workflows: [] });
    mockUseNamespace.mockReturnValue({
      namespace: 'test-namespace',
      isNamespaceResolved: true,
      isPending: false,
      readOnlyMode: false,
    });
  });

  it('should use the namespace resolved by the provider', () => {
    renderPage();

    expect(mockUseWorkflows).toHaveBeenCalledWith('test-namespace');
  });

  it('should not fall back to an assumed namespace before one resolves', () => {
    mockUseNamespace.mockReturnValue({
      namespace: '',
      isNamespaceResolved: false,
      isPending: true,
      readOnlyMode: false,
    });

    renderPage();

    expect(mockUseWorkflows).toHaveBeenCalledWith('');
    expect(mockUseWorkflows).not.toHaveBeenCalledWith('default');
  });

  it('should render page header and sessions section', () => {
    renderPage();

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('sessions-section')).toBeInTheDocument();
  });
});
