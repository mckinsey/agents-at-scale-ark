import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  type WorkflowTemplate,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

import FlowDetailPage from './page';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    get: vi.fn(),
    getYaml: vi.fn(),
    getStats: vi.fn(),
    canCreate: vi.fn(),
    canUpdate: vi.fn(),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/cards/workflow-stats-card', () => ({
  WorkflowStatsCard: () => <div data-testid="stats-card" />,
}));

vi.mock('@/components/workflow-dag-viewer', () => ({
  WorkflowDagViewer: () => <div data-testid="dag-viewer" />,
}));

vi.mock('@/components/code-viewer', () => ({
  CodeViewer: () => <div data-testid="code-viewer" />,
}));

vi.mock('@/components/dialogs/run-workflow-dialog', () => ({
  RunWorkflowDialog: () => <div data-testid="run-dialog" />,
}));

vi.mock('@/components/dialogs/delete-workflow-template-dialog', () => ({
  DeleteWorkflowTemplateDialog: () => <div data-testid="delete-dialog" />,
}));

const mockPush = vi.fn();
const mockCanCreate = vi.mocked(workflowTemplatesService.canCreate);
const mockCanUpdate = vi.mocked(workflowTemplatesService.canUpdate);

const template: WorkflowTemplate = {
  apiVersion: 'argoproj.io/v1alpha1',
  kind: 'WorkflowTemplate',
  metadata: { name: 'my-flow', annotations: {} },
  spec: { entrypoint: 'main', templates: [] },
};

function setup(overrides?: {
  canUpdate?: boolean;
  readOnlyMode?: boolean;
  namespace?: string;
}) {
  vi.mocked(useParams).mockReturnValue({ id: 'my-flow' });

  vi.mocked(useNamespace).mockReturnValue({
    namespace: overrides?.namespace ?? 'default',
    readOnlyMode: overrides?.readOnlyMode ?? false,
  } as unknown as ReturnType<typeof useNamespace>);

  vi.mocked(useNamespacedNavigation).mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
  });

  vi.mocked(workflowTemplatesService.get).mockResolvedValue(template);
  vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(
    'kind: WorkflowTemplate',
  );
  vi.mocked(workflowTemplatesService.getStats).mockResolvedValue({
    total: 0,
    succeeded: 0,
    running: 0,
    failed: 0,
  });

  mockCanCreate.mockResolvedValue(false);
  mockCanUpdate.mockResolvedValue(overrides?.canUpdate ?? false);
}

describe('FlowDetailPage Edit button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the Edit button when canUpdate is false', async () => {
    setup({ canUpdate: false });

    render(<FlowDetailPage />);

    await screen.findByText('my-flow');
    await waitFor(() => expect(mockCanUpdate).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /edit template/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the Edit button when canUpdate is true and navigates to the edit route', async () => {
    setup({ canUpdate: true });
    const user = userEvent.setup();

    render(<FlowDetailPage />);

    await screen.findByText('my-flow');
    const editButton = await screen.findByRole('button', {
      name: /edit template/i,
    });

    await user.click(editButton);
    expect(mockPush).toHaveBeenCalledWith('/workflow-templates/my-flow/edit');
  });

  it('hides the Edit button in read-only mode even when canUpdate is true', async () => {
    setup({ canUpdate: true, readOnlyMode: true });

    render(<FlowDetailPage />);

    await screen.findByText('my-flow');
    await waitFor(() => expect(mockCanUpdate).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /edit template/i }),
    ).not.toBeInTheDocument();
  });
});
