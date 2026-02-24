import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WorkflowTemplatesPage from '@/app/(dashboard)/workflow-templates/page';

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => (
    <div data-testid="page-header">Page Header</div>
  ),
}));

vi.mock('@/components/sections/workflow-templates-section', () => ({
  WorkflowTemplatesSection: () => (
    <div data-testid="workflow-templates-section">Workflow Templates Section</div>
  ),
}));

vi.mock('@/lib/services/workflow-templates-hooks', () => ({
  useGetAllWorkflowTemplates: vi.fn(() => ({
    data: [{ name: 'test-workflow-1' }, { name: 'test-workflow-2' }],
    isPending: false,
    error: null,
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
      </QueryClientProvider>
    );
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('should render workflow templates section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('workflow-templates-section')).toBeInTheDocument();
  });

  it('should render page title with count', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkflowTemplatesPage />
      </QueryClientProvider>
    );
    expect(screen.getByText('Workflow Templates (2)')).toBeInTheDocument();
  });
});
