import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WorkflowTemplatesPage from '@/app/(dashboard)/workflow-templates/page';

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ currentPage, actions }: { currentPage: string; actions?: React.ReactNode }) => (
    <div data-testid="page-header">
      <span>{currentPage}</span>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/sections/workflow-templates-section', () => ({
  WorkflowTemplatesSection: () => (
    <div data-testid="workflow-templates-section">
      Workflow Templates Section
    </div>
  ),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({ namespace: 'default', readOnlyMode: false })),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('@/lib/hooks/use-workflow-template-access', () => ({
  useWorkflowTemplateAccess: vi.fn(() => ({
    canCreate: false,
    canUpdate: false,
    loading: false,
  })),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('WorkflowTemplatesPage', () => {
  it('should render page header', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('should render workflow templates section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>,
    );
    expect(
      screen.getByTestId('workflow-templates-section'),
    ).toBeInTheDocument();
  });

  it('should render page title and subtitle', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole('heading', { name: 'Workflows' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Automate complex processes with agentic orchestration'),
    ).toBeInTheDocument();
  });

  it('should render "Workflows" breadcrumb current page', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>,
    );
    const header = screen.getByTestId('page-header');
    expect(header).toHaveTextContent('Workflows');
  });

  it('should render the "Add group" button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('workflow-add-group')).toBeInTheDocument();
  });
});
