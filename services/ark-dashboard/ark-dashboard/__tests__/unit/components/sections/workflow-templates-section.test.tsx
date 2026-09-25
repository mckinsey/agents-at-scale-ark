import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppRouterMock } from '@/__tests__/setup/mock-app-router';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import type { WorkflowTemplateListItem } from '@/components/sections/workflow-templates-table';
import { toast } from '@/components/ui/sonner';
import type { WorkflowTemplate } from '@/lib/services/workflow-templates';

const mockList = vi.fn();
const mockDelete = vi.fn();
const mockIsArgoNotInstalledError = vi.fn(() => false);
const mockPush = vi.fn();
const mockReadOnly = { value: false };
const mockAccess = { canCreate: true };

vi.mock('next/navigation', async () => {
  const { createAppRouterMock } =
    await import('@/__tests__/setup/mock-app-router');
  return createAppRouterMock();
});

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    list: (...args: unknown[]) => mockList(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    run: vi.fn(),
  },
  isArgoNotInstalledError: (...args: unknown[]) =>
    mockIsArgoNotInstalledError(...args),
  WORKFLOW_TEMPLATE_ANNOTATIONS: {
    TITLE: 'workflows.argoproj.io/title',
    DESCRIPTION: 'workflows.argoproj.io/description',
  },
}));

vi.mock('@/lib/hooks/use-workflow-template-access', () => ({
  useWorkflowTemplateAccess: () => ({
    canCreate: mockAccess.canCreate,
    canUpdate: true,
    loading: false,
  }),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush, replace: vi.fn() }),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    readOnlyMode: mockReadOnly.value,
    isPending: false,
    isNamespaceResolved: true,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}));

vi.mock('@/components/sections/workflow-templates-not-installed', () => ({
  WorkflowTemplatesNotInstalled: () => (
    <div data-testid="not-installed">Argo Workflows isn&apos;t installed</div>
  ),
}));

vi.mock('@/components/sections/workflow-templates-table', () => ({
  WorkflowTemplatesTable: ({
    templates,
  }: {
    templates: WorkflowTemplateListItem[];
  }) => (
    <div data-testid="workflow-templates-table">
      {templates.map(template => (
        <div key={template.id} data-testid="workflow-template-row">
          <span>{template.name}</span>
          {template.title && <span>{template.title}</span>}
          {template.description && <span>{template.description}</span>}
          <span>{template.stages} stages</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const templates: WorkflowTemplate[] = [
  {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'WorkflowTemplate',
    metadata: { name: 'simple-workflow', namespace: 'default' },
  },
  {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'WorkflowTemplate',
    metadata: {
      name: 'composer-workflow',
      namespace: 'default',
      annotations: {
        'workflows.argoproj.io/title': 'Data Processing Pipeline',
        'workflows.argoproj.io/description':
          'A workflow for processing customer data',
      },
    },
  },
];

describe('WorkflowTemplatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRouterMock();
    mockReadOnly.value = false;
    mockAccess.canCreate = true;
    mockIsArgoNotInstalledError.mockReturnValue(false);
  });

  it('shows Loading... while data is pending', () => {
    mockList.mockReturnValue(new Promise(() => {}));
    render(<WorkflowTemplatesSection />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the table with the returned templates', async () => {
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    expect(
      await screen.findByTestId('workflow-templates-table'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('workflow-template-row')).toHaveLength(2);
    expect(screen.getByText('simple-workflow')).toBeInTheDocument();
  });

  it('maps title, description and stage count from annotations', async () => {
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');
    expect(screen.getByText('Data Processing Pipeline')).toBeInTheDocument();
    expect(
      screen.getByText('A workflow for processing customer data'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('0 stages')).toHaveLength(2);
  });

  it('requests templates for the current namespace, once on mount', async () => {
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith('default');
  });

  it('filters by search term (case-insensitive)', async () => {
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');
    await userEvent.type(screen.getByPlaceholderText('Search'), 'COMPOSER');
    expect(screen.getByText('composer-workflow')).toBeInTheDocument();
    expect(screen.queryByText('simple-workflow')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no templates', async () => {
    mockList.mockResolvedValue([]);
    render(<WorkflowTemplatesSection />);
    expect(
      await screen.findByText('No Workflow Templates Yet'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-ark/developer-guide/workflows/',
    );
  });

  it('shows the not-installed state when Argo is missing', async () => {
    mockIsArgoNotInstalledError.mockReturnValue(true);
    mockList.mockRejectedValue(new Error('argo missing'));
    render(<WorkflowTemplatesSection />);
    expect(await screen.findByTestId('not-installed')).toBeInTheDocument();
  });

  it('shows an error toast for generic load failures', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    render(<WorkflowTemplatesSection />);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId('not-installed')).not.toBeInTheDocument();
  });

  it('hides the create button when the user cannot create', async () => {
    mockAccess.canCreate = false;
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');
    expect(
      screen.queryByTestId('workflow-create-template'),
    ).not.toBeInTheDocument();
  });

  it('disables the create button in read-only mode', async () => {
    mockReadOnly.value = true;
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');
    expect(screen.getByTestId('workflow-create-template')).toBeDisabled();
  });

  it('forwards name, title and description as query params', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(templates);
    render(<WorkflowTemplatesSection />);
    await screen.findByTestId('workflow-templates-table');

    await user.click(screen.getByTestId('workflow-create-template'));

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

    expect(mockPush).toHaveBeenCalledWith(
      '/workflow-templates/new?name=my-workflow&title=My%20Workflow&description=Does%20a%20thing',
    );
  });
});
