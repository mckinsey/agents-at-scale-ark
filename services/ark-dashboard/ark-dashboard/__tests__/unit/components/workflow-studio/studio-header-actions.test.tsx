import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioHeaderActions } from '@/components/workflow-studio/studio-header-actions';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

const pushMock = vi.fn();
const replaceMock = vi.fn();
let readOnlyMode = false;

vi.mock('@/lib/services/workflow-templates', () => ({
  WORKFLOW_TEMPLATE_ANNOTATIONS: {
    TITLE: 'workflows.argoproj.io/title',
    DESCRIPTION: 'workflows.argoproj.io/description',
  },
  workflowTemplatesService: {
    getYaml: vi.fn(),
    save: vi.fn(),
    nameExists: vi.fn(),
    run: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode }),
}));

vi.mock('@/lib/services/author-agent-preflight', () => ({
  getAuthorAgentPreflight: vi.fn(async () => ({
    agentPresent: true,
    agentReady: true,
    mcpToolsOnAgent: true,
    mcpToolCrdsPresent: true,
  })),
}));

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
  },
}));

vi.mock('@/components/workflow-dag-viewer', () => ({
  WorkflowDagViewer: ({ manifest }: { manifest: string }) => (
    <div data-testid="dag-viewer">{manifest}</div>
  ),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/utils/workflow-toast', () => ({
  showWorkflowStartedToast: vi.fn(),
}));

const validYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: existing-workflow',
  'spec:',
  '  entrypoint: main',
  '  arguments:',
  '    parameters:',
  '      - name: region',
  '        value: us-east-1',
].join('\n');

describe('StudioHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnlyMode = false;
  });

  it('fetches stats when persisted and renders the four counts plus the total badge', async () => {
    vi.mocked(workflowTemplatesService.getStats).mockResolvedValue({
      total: 5,
      succeeded: 3,
      running: 1,
      failed: 1,
    });

    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);

    fireEvent.click(screen.getByTestId('studio-activity-trigger'));

    await waitFor(() => {
      expect(workflowTemplatesService.getStats).toHaveBeenCalledWith(
        'existing-workflow',
      );
    });

    expect(screen.getByTestId('studio-activity-total')).toHaveTextContent('5');
    expect(screen.getByTestId('studio-activity-succeeded')).toHaveTextContent(
      '3',
    );
    expect(screen.getByTestId('studio-activity-running')).toHaveTextContent(
      '1',
    );
    expect(screen.getByTestId('studio-activity-failed')).toHaveTextContent('1');

    await waitFor(() => {
      expect(screen.getByTestId('studio-activity-badge')).toHaveTextContent(
        '5',
      );
    });
  });

  it('links each activity stat to the workflow runs page with filters', async () => {
    vi.mocked(workflowTemplatesService.getStats).mockResolvedValue({
      total: 5,
      succeeded: 3,
      running: 1,
      failed: 1,
    });

    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);

    fireEvent.click(screen.getByTestId('studio-activity-trigger'));

    await waitFor(() => {
      expect(
        screen.getByTestId('studio-activity-link-total'),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByTestId('studio-activity-link-total').getAttribute('href'),
    ).toBe('/workflow-runs?workflowTemplateName=existing-workflow');
    expect(
      screen.getByTestId('studio-activity-link-succeeded').getAttribute('href'),
    ).toBe(
      '/workflow-runs?workflowTemplateName=existing-workflow&status=succeeded',
    );
    expect(
      screen.getByTestId('studio-activity-link-running').getAttribute('href'),
    ).toBe(
      '/workflow-runs?workflowTemplateName=existing-workflow&status=running',
    );
    expect(
      screen.getByTestId('studio-activity-link-failed').getAttribute('href'),
    ).toBe('/workflow-runs?workflowTemplateName=existing-workflow&status=failed');
  });

  it('populates the activity badge on mount without opening the popover', async () => {
    vi.mocked(workflowTemplatesService.getStats).mockResolvedValue({
      total: 7,
      succeeded: 4,
      running: 2,
      failed: 1,
    });

    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);

    await waitFor(() => {
      expect(workflowTemplatesService.getStats).toHaveBeenCalledWith(
        'existing-workflow',
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('studio-activity-badge')).toHaveTextContent(
        '7',
      );
    });
  });

  it('disables activity when not persisted', () => {
    render(<StudioHeaderActions workflowName="draft" persisted={false} />);
    expect(screen.getByTestId('studio-activity-trigger')).toBeDisabled();
    expect(screen.getByTestId('studio-open-argo')).toBeDisabled();
    expect(workflowTemplatesService.getStats).not.toHaveBeenCalled();
  });

  it('opens Argo with the correct URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);

    fireEvent.click(screen.getByTestId('studio-open-argo'));

    expect(openSpy).toHaveBeenCalledWith(
      'http://localhost:2746/workflow-templates/default/existing-workflow',
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });

  it('deletes and navigates to the templates list on confirm', async () => {
    vi.mocked(workflowTemplatesService.delete).mockResolvedValue(undefined);

    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);

    fireEvent.click(screen.getByTestId('studio-delete'));

    const confirm = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(workflowTemplatesService.delete).toHaveBeenCalledWith(
        'existing-workflow',
      );
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/workflow-templates');
    });
  });

  it('hides the delete action in read-only mode', () => {
    readOnlyMode = true;
    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);
    expect(screen.queryByTestId('studio-delete')).not.toBeInTheDocument();
  });

  it('no longer renders the download trigger in the header actions', () => {
    render(<StudioHeaderActions workflowName="existing-workflow" persisted />);
    expect(screen.queryByTestId('studio-download')).not.toBeInTheDocument();
  });
});

describe('WorkflowStudio run button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnlyMode = false;
  });

  it('shows create instead of run on a fresh unpersisted workflow', () => {
    render(<WorkflowStudio mode="new" initialName="my-workflow" />);
    expect(screen.queryByTestId('studio-run')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-save')).toHaveTextContent('Create');
  });

  it('disables run while there are unsaved changes', async () => {
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(validYaml);

    render(<WorkflowStudio mode="edit" initialName="existing-workflow" />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-run')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('studio-view-yaml'));
    fireEvent.change(screen.getByTestId('studio-yaml-editor'), {
      target: { value: validYaml + '\n  # edit' },
    });

    expect(screen.getByTestId('studio-run')).toBeDisabled();
  });

  it('opens the run dialog and runs with the workflow name when persisted and clean', async () => {
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(validYaml);
    vi.mocked(workflowTemplatesService.run).mockResolvedValue({
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name: 'existing-workflow-123' },
      spec: { workflowTemplateRef: { name: 'existing-workflow' } },
    });

    render(<WorkflowStudio mode="edit" initialName="existing-workflow" />);

    await waitFor(() => {
      expect(screen.getByTestId('studio-run')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('studio-run'));

    const runButton = await screen.findByRole('button', { name: 'Run' });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(workflowTemplatesService.run).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(workflowTemplatesService.run).mock.calls[0][0]).toBe(
      'existing-workflow',
    );
  });
});
