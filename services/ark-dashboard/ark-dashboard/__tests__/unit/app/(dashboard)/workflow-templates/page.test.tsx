import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkflowTemplatesPage from '@/app/(dashboard)/workflow-templates/page';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({
    currentPage,
    actions,
  }: {
    currentPage: string;
    actions?: React.ReactNode;
  }) => (
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

const pushMock = vi.fn();
vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: pushMock, replace: vi.fn() })),
}));

vi.mock('@/lib/hooks/use-workflow-template-access', () => ({
  useWorkflowTemplateAccess: vi.fn(() => ({
    canCreate: false,
    canUpdate: false,
    loading: false,
  })),
}));

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    list: vi.fn(),
  },
}));

const accessMock = vi.mocked(useWorkflowTemplateAccess);
const listMock = vi.mocked(workflowTemplatesService.list);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowTemplatesPage />
    </QueryClientProvider>,
  );
}

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
    accessMock.mockReturnValue({
      canCreate: false,
      canUpdate: false,
      loading: false,
    });
  });

  it('should render page header', () => {
    renderPage();
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('should render workflow templates section', () => {
    renderPage();
    expect(
      screen.getByTestId('workflow-templates-section'),
    ).toBeInTheDocument();
  });

  it('should render page title and subtitle', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Workflow Templates' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Automate complex processes with agentic orchestration'),
    ).toBeInTheDocument();
  });

  it('should render "Workflow Templates" breadcrumb current page', () => {
    renderPage();
    const header = screen.getByTestId('page-header');
    expect(header).toHaveTextContent('Workflow Templates');
  });

  it('should render the "Add group" button', () => {
    renderPage();
    expect(screen.getByTestId('workflow-add-group')).toBeInTheDocument();
  });

  it('forwards name, title and description as query params', async () => {
    const user = userEvent.setup();
    accessMock.mockReturnValue({
      canCreate: true,
      canUpdate: false,
      loading: false,
    });

    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Create workflow template' }),
    );

    await waitFor(() => expect(listMock).toHaveBeenCalled());

    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByTestId('workflow-name-input'),
      'my-workflow',
    );
    await user.type(
      within(dialog).getByTestId('workflow-title-input'),
      'My Workflow',
    );
    await user.type(
      within(dialog).getByTestId('workflow-description-input'),
      'Does a thing',
    );

    const submit = within(dialog).getByRole('button', {
      name: 'Create workflow template',
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(pushMock).toHaveBeenCalledWith(
      '/workflow-templates/new?name=my-workflow&title=My%20Workflow&description=Does%20a%20thing',
    );
  });
});
