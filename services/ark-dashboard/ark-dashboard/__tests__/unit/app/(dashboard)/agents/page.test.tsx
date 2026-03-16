import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentsPage from '@/app/(dashboard)/agents/page';

const mockOpenApiDialog = vi.fn();
const mockOpenAddEditor = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    isNamespaceResolved: true,
    availableNamespaces: [{ name: 'default' }],
    isPending: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
    readOnlyMode: false,
  })),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header">
      <div data-testid="page-actions">{actions}</div>
    </div>
  ),
}));

vi.mock('@/components/sections/agents-section', () => {
  const React = require('react');
  return {
    AgentsSection: React.forwardRef(
      (
        _props: object,
        ref: React.ForwardedRef<{
          openAddEditor: () => void;
          openApiDialog: () => void;
        }>,
      ) => {
        if (ref && typeof ref === 'object') {
          (
            ref as React.MutableRefObject<{
              openAddEditor: () => void;
              openApiDialog: () => void;
            }>
          ).current = {
            openAddEditor: mockOpenAddEditor,
            openApiDialog: mockOpenApiDialog,
          };
        }
        return React.createElement(
          'div',
          { 'data-testid': 'agents-section' },
          'Agents Section',
        );
      },
    ),
  };
});

vi.mock('@/lib/services/agents-hooks', () => ({
  useGetAllAgents: vi.fn(() => ({
    data: [{ name: 'agent-1' }, { name: 'agent-2' }],
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

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page header with correct title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );
    expect(screen.getByText('Agents (2)')).toBeInTheDocument();
  });

  it('should render agents section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('agents-section')).toBeInTheDocument();
  });

  it('should render "Use via API" button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );
    const actionsContainer = screen.getByTestId('page-actions');
    expect(actionsContainer).toBeInTheDocument();
    expect(actionsContainer.textContent).toContain('Use via API');
  });

  it('should render "Create Agent" button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );
    const actionsContainer = screen.getByTestId('page-actions');
    expect(actionsContainer.textContent).toContain('Create Agent');
  });

  it('should call openApiDialog when "Use via API" button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );

    const apiButton = screen.getByRole('button', { name: /Use via API/i });
    expect(apiButton).toBeInTheDocument();

    await user.click(apiButton);
    expect(mockOpenApiDialog).toHaveBeenCalled();
  });

  it('should navigate to "Create Agent" page when "Create Agent" button is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );

    const createButton = screen.getByRole('link', { name: /Create Agent/i });
    expect(createButton).toBeInTheDocument();
    expect(createButton).toHaveAttribute('href', '/agents/new');
  });
});
