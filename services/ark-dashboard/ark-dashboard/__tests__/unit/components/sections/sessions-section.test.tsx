import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAppRouterMock,
  resetAppRouterMock,
} from '@/__tests__/setup/mock-app-router';
import { SessionsSection } from '@/components/sections/sessions-section';
import { toast } from '@/components/ui/sonner';
import { APIError } from '@/lib/api/client';
import { fetchNodeLogWindow } from '@/lib/services/workflow-logs';
import { resetNodeLogStore } from '@/lib/services/workflow-logs-store';
import {
  type MappedStepStatus,
  mapArgoWorkflowToSession,
  mapArgoWorkflowsToSessions,
} from '@/lib/services/workflow-mapper';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';
import {
  useWorkflow,
  useWorkflowLifecycleActions,
  useWorkflows,
} from '@/lib/services/workflows-hooks';
import type { ArgoWorkflow } from '@/lib/types/argo-workflow';

const mockUseNamespace = vi.fn();

vi.mock('@/lib/services/workflow-templates-hooks', () => ({
  useGetAllWorkflowTemplates: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => mockUseNamespace(),
}));

vi.mock('next/navigation', async () => {
  const { createAppRouterMock } =
    await import('@/__tests__/setup/mock-app-router');
  return createAppRouterMock('/workflow-runs');
});

vi.mock('@/lib/services/workflows-hooks', () => ({
  useWorkflows: vi.fn(),
  useWorkflow: vi.fn(),
  useWorkflowLifecycleActions: vi.fn(),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/services/workflow-logs', () => ({
  fetchNodeLogWindow: vi.fn().mockRejectedValue(new Error('404 not found')),
}));

vi.mock('@/lib/services/workflow-mapper', () => ({
  mapArgoWorkflowsToSessions: vi.fn(),
  mapArgoWorkflowToSession: vi.fn(),
}));

const mockWorkflow = {
  metadata: {
    name: 'test-workflow-123',
    namespace: 'default',
    uid: 'abc-123-def',
    creationTimestamp: '2024-01-15T10:00:00Z',
  },
  spec: {
    workflowTemplateRef: {
      name: 'data-processing-template',
    },
  },
  status: {
    phase: 'Succeeded',
    startedAt: '2024-01-15T10:00:00Z',
    finishedAt: '2024-01-15T10:05:30Z',
    nodes: {
      'test-workflow-123': {
        id: 'test-workflow-123',
        name: 'test-workflow-123',
        displayName: 'test-workflow-123',
        type: 'DAG',
        phase: 'Succeeded',
        startedAt: '2024-01-15T10:00:00Z',
        finishedAt: '2024-01-15T10:05:30Z',
        children: ['step-1', 'step-2'],
      },
      'step-1': {
        id: 'step-1',
        name: 'process-data',
        displayName: 'Process Data',
        type: 'Pod',
        phase: 'Succeeded',
        startedAt: '2024-01-15T10:00:10Z',
        finishedAt: '2024-01-15T10:02:30Z',
        templateName: 'process-data-template',
        inputs: {
          parameters: [
            { name: 'input-file', value: 's3://bucket/data.csv' },
            { name: 'batch-size', value: '1000' },
          ],
        },
        outputs: {
          parameters: [{ name: 'processed-records', value: '5432' }],
        },
      },
      'step-2': {
        id: 'step-2',
        name: 'validate-output',
        displayName: 'Validate Output',
        type: 'Pod',
        phase: 'Succeeded',
        startedAt: '2024-01-15T10:02:35Z',
        finishedAt: '2024-01-15T10:05:30Z',
        templateName: 'validate-template',
      },
    },
  },
};

const mockFailedWorkflow = {
  metadata: {
    name: 'failed-workflow-456',
    namespace: 'default',
    uid: 'xyz-789',
    creationTimestamp: '2024-01-15T11:00:00Z',
  },
  spec: {
    workflowTemplateRef: {
      name: 'data-processing-template',
    },
  },
  status: {
    phase: 'Failed',
    startedAt: '2024-01-15T11:00:00Z',
    finishedAt: '2024-01-15T11:02:00Z',
    nodes: {
      'failed-workflow-456': {
        id: 'failed-workflow-456',
        name: 'failed-workflow-456',
        displayName: 'failed-workflow-456',
        type: 'DAG',
        phase: 'Failed',
        startedAt: '2024-01-15T11:00:00Z',
        finishedAt: '2024-01-15T11:02:00Z',
        children: ['failed-step'],
      },
      'failed-step': {
        id: 'failed-step',
        name: 'process-data',
        displayName: 'Process Data',
        type: 'Pod',
        phase: 'Failed',
        startedAt: '2024-01-15T11:00:10Z',
        finishedAt: '2024-01-15T11:02:00Z',
        message:
          'Error: Connection timeout to database server at db.example.com:5432',
        templateName: 'process-data-template',
        outputs: {
          exitCode: '1',
        },
      },
    },
  },
};

const mockRunningWorkflow = {
  metadata: {
    name: 'running-workflow-789',
    namespace: 'default',
    uid: 'running-123',
    creationTimestamp: '2024-01-15T12:00:00Z',
  },
  spec: {
    workflowTemplateRef: {
      name: 'ml-training-template',
    },
  },
  status: {
    phase: 'Running',
    startedAt: '2024-01-15T12:00:00Z',
    nodes: {
      'running-workflow-789': {
        id: 'running-workflow-789',
        name: 'running-workflow-789',
        displayName: 'running-workflow-789',
        type: 'DAG',
        phase: 'Running',
        startedAt: '2024-01-15T12:00:00Z',
        children: ['running-step'],
      },
      'running-step': {
        id: 'running-step',
        name: 'train-model',
        displayName: 'Train Model',
        type: 'Pod',
        phase: 'Running',
        startedAt: '2024-01-15T12:00:10Z',
        templateName: 'train-template',
      },
    },
  },
};

const mockWorkflowWithoutTemplate = {
  metadata: {
    name: 'standalone-workflow',
    namespace: 'default',
    uid: 'standalone-123',
    creationTimestamp: '2024-01-15T09:00:00Z',
  },
  spec: {},
  status: {
    phase: 'Succeeded',
    startedAt: '2024-01-15T09:00:00Z',
    finishedAt: '2024-01-15T09:05:00Z',
    nodes: {
      'standalone-workflow': {
        id: 'standalone-workflow',
        name: 'standalone-workflow',
        displayName: 'standalone-workflow',
        type: 'DAG',
        phase: 'Succeeded',
        startedAt: '2024-01-15T09:00:00Z',
        finishedAt: '2024-01-15T09:05:00Z',
      },
    },
  },
};

describe('SessionsSection', () => {
  const mockRouter = getAppRouterMock();
  const allWorkflows = [mockWorkflow, mockFailedWorkflow, mockRunningWorkflow];
  const mockRunAction = vi.fn();
  const mockShowCreatedWorkflow = vi.fn();
  const mockWatchWorkflow = vi.fn();
  const mockUpdateWorkflowItem = vi.fn();

  const getCard = (name: RegExp) =>
    within(screen.getByRole('button', { name }).parentElement!);

  const getRunningCard = () =>
    within(
      screen.getByRole('button', { name: /running-workflow-789/i })
        .parentElement!,
    );

  const renderWithRunningWorkflowSpec = (
    spec: Record<string, unknown>,
    pauseState?: 'pausing' | 'paused',
  ) => {
    vi.mocked(useWorkflows).mockReturnValue({
      workflows: [
        mockWorkflow,
        mockFailedWorkflow,
        { ...mockRunningWorkflow, spec, pauseState },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
      showCreatedWorkflow: mockShowCreatedWorkflow,
      watchWorkflow: mockWatchWorkflow,
      updateWorkflowItem: mockUpdateWorkflowItem,
    } as any);
    render(<SessionsSection />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAppRouterMock();
    resetNodeLogStore();
    mockUseNamespace.mockReturnValue({
      namespace: 'default',
      isNamespaceResolved: true,
      isPending: false,
      readOnlyMode: false,
    });
    vi.mocked(mapArgoWorkflowsToSessions).mockImplementation(workflows =>
      workflows.map((w: any) => ({
        id: w.metadata.name,
        name: w.metadata.name,
        type: 'workflow' as const,
        status: w.status.phase.toLowerCase(),
        startedAt: w.status.startedAt,
        finishedAt: w.status.finishedAt,
        duration: w.status.finishedAt ? '5m 30s' : 'Running',
        steps: [],
        namespace: w.metadata.namespace,
        uid: w.metadata.uid,
        suspended: w.spec?.suspend === true,
        pauseState: w.pauseState,
        shutdownRequested: Boolean(w.spec?.shutdown),
      })),
    );

    vi.mocked(mapArgoWorkflowToSession).mockImplementation((workflow: any) => ({
      id: workflow.metadata.name,
      name: workflow.metadata.name,
      type: 'workflow' as const,
      status: workflow.status.phase.toLowerCase(),
      startedAt: workflow.status.startedAt,
      finishedAt: workflow.status.finishedAt,
      duration: workflow.status.finishedAt ? '5m 30s' : 'Running',
      steps: Object.values(workflow.status.nodes)
        .filter((node: any) => node.id !== workflow.metadata.name)
        .map((node: any) => ({
          id: node.id,
          name: node.name,
          displayName: node.displayName,
          type: 'container',
          status: node.phase.toLowerCase(),
          startedAt: node.startedAt,
          finishedAt: node.finishedAt,
          duration: node.finishedAt ? '2m 20s' : undefined,
          message: node.message,
          detail: {
            inputs: node.inputs?.parameters?.reduce((acc: any, p: any) => {
              acc[p.name] = p.value;
              return acc;
            }, {}),
            outputs: node.outputs?.parameters?.reduce((acc: any, p: any) => {
              acc[p.name] = p.value;
              return acc;
            }, {}),
            exitCode: node.outputs?.exitCode
              ? parseInt(node.outputs.exitCode)
              : undefined,
            workflowName: workflow.metadata.name,
            nodeId: node.id,
            namespace: workflow.metadata.namespace,
          },
          children: [],
        })),
      namespace: workflow.metadata.namespace,
      uid: workflow.metadata.uid,
    }));

    vi.mocked(useWorkflows).mockReturnValue({
      workflows: allWorkflows,
      loading: false,
      error: null,
      refetch: vi.fn(),
      showCreatedWorkflow: mockShowCreatedWorkflow,
      watchWorkflow: mockWatchWorkflow,
      updateWorkflowItem: mockUpdateWorkflowItem,
    } as any);
    vi.mocked(useWorkflow).mockReturnValue({
      workflow: null,
      loading: false,
      error: null,
    } as any);
    mockRunAction.mockResolvedValue(undefined);
    mockShowCreatedWorkflow.mockReturnValue(true);
    vi.mocked(useWorkflowLifecycleActions).mockReturnValue({
      runAction: mockRunAction,
      isPending: () => false,
    });

    vi.mocked(useGetAllWorkflowTemplates).mockReturnValue({
      data: [
        { metadata: { name: 'data-processing-template' } },
        { metadata: { name: 'ml-training-template' } },
      ],
      isPending: false,
    } as any);
  });

  describe('Namespace', () => {
    it('should use the namespace resolved by the provider', () => {
      render(<SessionsSection />);

      expect(useWorkflows).toHaveBeenCalledWith(
        'default',
        expect.any(Object),
        undefined,
        expect.any(Function),
      );
    });

    it('should not fall back to an assumed namespace before one resolves', () => {
      mockUseNamespace.mockReturnValue({
        namespace: '',
        isNamespaceResolved: false,
        isPending: true,
        readOnlyMode: false,
      });

      render(<SessionsSection />);

      expect(useWorkflows).toHaveBeenCalledWith(
        '',
        expect.any(Object),
        undefined,
        expect.any(Function),
      );
      expect(useWorkflows).not.toHaveBeenCalledWith(
        'default',
        expect.any(Object),
        undefined,
        expect.any(Function),
      );
    });
  });

  describe('Loading, Empty, and Error States', () => {
    it('should show loading spinner when loading', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });

    it('should show empty state when no sessions', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(screen.getByText('No workflow runs yet')).toBeInTheDocument();
    });

    it('should show filtered empty state when filters applied', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(
          screen.getByText(/no workflow runs found matching/i),
        ).toBeInTheDocument();
      });
    });

    it('should display error message when loading fails', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: new Error('Failed to fetch workflows'),
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(
        screen.getByText(/Error: Failed to fetch workflows/i),
      ).toBeInTheDocument();
    });

    it('should handle network errors gracefully', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: new Error('Network error: Failed to connect to server'),
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  describe('Session List', () => {
    it('should display all three sessions in the list', () => {
      render(<SessionsSection />);

      const allButtons = screen.getAllByRole('button');
      const sessionButtons = allButtons.filter(
        btn =>
          btn.title === 'test-workflow-123' ||
          btn.title === 'failed-workflow-456' ||
          btn.title === 'running-workflow-789',
      );

      expect(sessionButtons).toHaveLength(3);
    });

    it('should show exact session count', () => {
      render(<SessionsSection />);

      const sessionCards = screen
        .getAllByRole('button')
        .filter(button =>
          [
            'test-workflow-123',
            'failed-workflow-456',
            'running-workflow-789',
          ].includes(button.title),
        );
      expect(sessionCards).toHaveLength(3);
    });

    it('should display correct status badges for each type of session', () => {
      render(<SessionsSection />);

      expect(screen.getAllByText('Succeeded').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Running').length).toBeGreaterThanOrEqual(1);
    });

    it('should show pause, stop, and cancel only on running workflow sessions', () => {
      render(<SessionsSection />);

      const runningCard = screen.getByRole('button', {
        name: /running-workflow-789/i,
      }).parentElement!;
      const runningControls = within(runningCard);
      expect(
        runningControls.getByRole('button', { name: 'Pause' }),
      ).toBeInTheDocument();
      expect(
        runningControls.getByRole('button', { name: 'Stop' }),
      ).toBeInTheDocument();
      expect(
        runningControls.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();

      for (const name of [/test-workflow-123/i, /failed-workflow-456/i]) {
        const card = screen.getByRole('button', { name }).parentElement!;
        expect(
          within(card).queryByRole('button', { name: 'Pause' }),
        ).not.toBeInTheDocument();
      }
    });

    it('should not select the session when a run control is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const runningCardButton = screen.getByRole('button', {
        name: /running-workflow-789/i,
      });
      const selectedBefore = runningCardButton.getAttribute('aria-current');

      await user.click(
        within(runningCardButton.parentElement!).getByRole('button', {
          name: 'Pause',
        }),
      );

      expect(runningCardButton.getAttribute('aria-current')).toBe(
        selectedBefore,
      );
    });

    it.each([
      ['Pause', 'suspend'],
      ['Stop', 'stop'],
      ['Cancel', 'terminate'],
    ])(
      'should run the %s action against the workflow',
      async (label, action) => {
        const user = userEvent.setup();
        render(<SessionsSection />);

        await user.click(getRunningCard().getByRole('button', { name: label }));

        expect(mockRunAction).toHaveBeenCalledWith(
          'running-workflow-789',
          action,
        );
      },
    );

    it('should pass the namespace and list updater to the lifecycle actions hook', () => {
      render(<SessionsSection />);

      expect(useWorkflowLifecycleActions).toHaveBeenCalledWith(
        'default',
        mockUpdateWorkflowItem,
      );
    });

    it('should show Pausing and keep Resume disabled while running steps finish', () => {
      renderWithRunningWorkflowSpec({ suspend: true }, 'pausing');

      const card = getRunningCard();
      expect(card.getByText('Pausing')).toBeInTheDocument();
      expect(card.getByRole('button', { name: 'Resume' })).toBeDisabled();
      expect(card.getByRole('button', { name: 'Stop' })).toBeEnabled();
      expect(card.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('should show Paused and enable Resume once no step is running', () => {
      renderWithRunningWorkflowSpec({ suspend: true }, 'paused');

      const card = getRunningCard();
      expect(card.getByText('Paused')).toBeInTheDocument();
      expect(card.getByRole('button', { name: 'Resume' })).toBeEnabled();
    });

    it('should explain on the Pause tooltip that running steps finish first', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      await user.hover(getRunningCard().getByRole('button', { name: 'Pause' }));

      await waitFor(() => {
        expect(
          screen.getAllByText(
            'Pause: running steps finish, no new steps start until resumed',
          ).length,
        ).toBeGreaterThan(0);
      });
    });

    it('should offer Resume instead of Pause for a suspended workflow', async () => {
      const user = userEvent.setup();
      renderWithRunningWorkflowSpec({ suspend: true });

      const card = getRunningCard();
      expect(
        card.queryByRole('button', { name: 'Pause' }),
      ).not.toBeInTheDocument();
      await user.click(card.getByRole('button', { name: 'Resume' }));

      expect(mockRunAction).toHaveBeenCalledWith(
        'running-workflow-789',
        'resume',
      );
    });

    it('should disable run controls while an action is pending', () => {
      vi.mocked(useWorkflowLifecycleActions).mockReturnValue({
        runAction: mockRunAction,
        isPending: (name: string) => name === 'running-workflow-789',
      });
      render(<SessionsSection />);

      const card = getRunningCard();
      for (const label of ['Pause', 'Stop', 'Cancel']) {
        expect(card.getByRole('button', { name: label })).toBeDisabled();
      }
    });

    it('should disable run controls while a shutdown is in progress', () => {
      renderWithRunningWorkflowSpec({ shutdown: 'Stop' });

      const card = getRunningCard();
      for (const label of ['Pause', 'Stop', 'Cancel']) {
        expect(card.getByRole('button', { name: label })).toBeDisabled();
      }
    });

    it('should show a generic error toast when a run action rejects with a non-Error', async () => {
      const user = userEvent.setup();
      mockRunAction.mockRejectedValue('boom');
      render(<SessionsSection />);

      await user.click(getRunningCard().getByRole('button', { name: 'Stop' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to stop workflow', {
          description: 'An unexpected error occurred',
        });
      });
    });

    it('should show an error toast when a page fails to load', () => {
      render(<SessionsSection />);
      const onPageError = vi.mocked(useWorkflows).mock.calls[0][3]!;

      act(() => {
        onPageError(new Error('List changed'));
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to load page', {
        description: 'List changed',
      });
    });

    it('should patch the list item with every fresh detail of the selected run', () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockRunningWorkflow as unknown as ArgoWorkflow,
        loading: false,
        error: null,
      });
      const { rerender } = render(<SessionsSection />);
      expect(mockUpdateWorkflowItem).toHaveBeenCalledWith(mockRunningWorkflow);

      const finished = {
        ...mockRunningWorkflow,
        status: { ...mockRunningWorkflow.status, phase: 'Succeeded' },
      };
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: finished as unknown as ArgoWorkflow,
        loading: false,
        error: null,
      });
      rerender(<SessionsSection />);

      expect(mockUpdateWorkflowItem).toHaveBeenCalledWith(finished);
    });

    it('should patch the list item when the selected run is already finished on its first fetch', () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockFailedWorkflow as unknown as ArgoWorkflow,
        loading: false,
        error: null,
      });
      render(<SessionsSection />);

      expect(mockUpdateWorkflowItem).toHaveBeenCalledWith(mockFailedWorkflow);
    });

    it('should refresh the selected run details after an action', async () => {
      const user = userEvent.setup();
      mockRunAction.mockResolvedValue(mockFailedWorkflow);
      render(<SessionsSection />);
      const lastRefreshKey = () => vi.mocked(useWorkflow).mock.lastCall?.[3];
      expect(lastRefreshKey()).toBe(0);

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', { name: 'Retry' }),
      );

      await waitFor(() => expect(lastRefreshKey()).toBe(1));
    });

    it('should keep following a run on its card after an action', async () => {
      const user = userEvent.setup();
      mockRunAction.mockResolvedValue({
        ...mockFailedWorkflow,
        status: { ...mockFailedWorkflow.status, phase: 'Running' },
      });
      render(<SessionsSection />);

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', { name: 'Retry' }),
      );

      await waitFor(() =>
        expect(mockWatchWorkflow).toHaveBeenCalledWith('failed-workflow-456'),
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should show an error toast when a run action fails', async () => {
      const user = userEvent.setup();
      mockRunAction.mockRejectedValue(
        new Error('Cannot shut down a completed workflow'),
      );
      render(<SessionsSection />);

      await user.click(getRunningCard().getByRole('button', { name: 'Stop' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to stop workflow', {
          description: 'Cannot shut down a completed workflow',
        });
      });
    });

    it('should offer Resubmit on a succeeded workflow', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const card = getCard(/test-workflow-123/i);
      expect(
        card.queryByRole('button', { name: 'Retry' }),
      ).not.toBeInTheDocument();
      await user.click(card.getByRole('button', { name: /Resubmit/ }));

      expect(mockRunAction).toHaveBeenCalledWith(
        'test-workflow-123',
        'resubmit',
      );
    });

    it.each([
      ['Retry', 'retry'],
      ['Resubmit', 'resubmit'],
    ])('should run %s on a failed workflow', async (label, action) => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', { name: label }),
      );

      expect(mockRunAction).toHaveBeenCalledWith('failed-workflow-456', action);
    });

    it('should select the new run after a resubmit', async () => {
      const user = userEvent.setup();
      const resubmitted = {
        ...mockRunningWorkflow,
        metadata: {
          ...mockRunningWorkflow.metadata,
          name: 'resubmitted-workflow-001',
          uid: 'resubmitted-001',
        },
        status: {
          ...mockRunningWorkflow.status,
          startedAt: '2020-01-01T00:00:00Z',
        },
      };
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [...allWorkflows, resubmitted],
        loading: false,
        error: null,
        refetch: vi.fn(),
        showCreatedWorkflow: mockShowCreatedWorkflow,
        watchWorkflow: mockWatchWorkflow,
        updateWorkflowItem: mockUpdateWorkflowItem,
      } as any);
      mockRunAction.mockResolvedValue(resubmitted);
      render(<SessionsSection />);

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', {
          name: 'Resubmit',
        }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /resubmitted-workflow-001/i }),
        ).toHaveAttribute('aria-current', 'true');
      });
      expect(mockShowCreatedWorkflow).toHaveBeenCalledWith(resubmitted);
      expect(mockWatchWorkflow).toHaveBeenCalledWith(
        'resubmitted-workflow-001',
      );
    });

    it('should keep the selection when the resubmitted run belongs to another namespace', async () => {
      const user = userEvent.setup();
      mockShowCreatedWorkflow.mockReturnValue(false);
      mockRunAction.mockResolvedValue({
        ...mockRunningWorkflow,
        metadata: {
          ...mockRunningWorkflow.metadata,
          name: 'resubmitted-workflow-001',
          namespace: 'other',
        },
      });
      render(<SessionsSection />);

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', {
          name: 'Resubmit',
        }),
      );

      await waitFor(() => expect(mockShowCreatedWorkflow).toHaveBeenCalled());
      expect(
        screen.getByRole('button', { name: /test-workflow-123/i }),
      ).toHaveAttribute('aria-current', 'true');
    });

    it('should not select another run after a non-resubmit action', async () => {
      const user = userEvent.setup();
      mockRunAction.mockResolvedValue(mockFailedWorkflow);
      render(<SessionsSection />);
      const selectedBefore = screen
        .getAllByRole('button')
        .find(button => button.getAttribute('aria-current') === 'true');

      await user.click(
        getCard(/failed-workflow-456/i).getByRole('button', { name: 'Retry' }),
      );

      await waitFor(() => expect(mockRunAction).toHaveBeenCalled());
      expect(
        screen
          .getAllByRole('button')
          .find(button => button.getAttribute('aria-current') === 'true'),
      ).toBe(selectedBefore);
    });

    it('should select the first session in the returned page by default', async () => {
      render(<SessionsSection />);

      await waitFor(() => {
        const sessionList = screen
          .getAllByRole('button')
          .filter(
            btn =>
              btn.title &&
              (btn.title === 'test-workflow-123' ||
                btn.title === 'failed-workflow-456' ||
                btn.title === 'running-workflow-789'),
          );

        expect(sessionList[0]).toHaveAttribute('title', 'test-workflow-123');
      });
    });
  });

  describe('Filters', () => {
    it('should pass workflow name filter to API', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);

      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'failed');

      await waitFor(() => {
        const lastCall =
          mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            workflowName: 'failed',
          }),
        );
      });
    });

    it('should pass status filter to API', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);

      render(<SessionsSection />);

      const statusSelect = screen.getByRole('combobox', { name: 'Status' });
      await user.click(statusSelect);

      const failedOption = await screen.findByRole('option', {
        name: /failed/i,
      });
      await user.click(failedOption);

      await waitFor(() => {
        const lastCall =
          mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            status: 'Failed',
          }),
        );
      });
    });

    it('should not pass a template filter for free text that was never selected', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);

      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      await user.type(templateInput, 'ml-training');

      await waitFor(() => {
        const lastCall =
          mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toHaveProperty('workflowTemplateName', undefined);
      });
    });

    it('should clear all filters and reset to defaults', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'test');

      const clearButton = screen.getByRole('button', {
        name: /clear filters/i,
      });
      await user.click(clearButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
        const lastCall =
          mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual({});
      });
    });

    it('should disable clear filters button when no active filters', () => {
      render(<SessionsSection />);

      const clearButton = screen.getByRole('button', {
        name: /clear filters/i,
      });
      expect(clearButton).toBeDisabled();
    });

    it('should enable clear filters button when filters are active', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        const clearButton = screen.getByRole('button', {
          name: /clear filters/i,
        });
        expect(clearButton).not.toBeDisabled();
      });
    });
  });

  describe('Step Details and Expansion', () => {
    it('should show step details button for each step', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        const expandButtons = screen.getAllByRole('button', {
          name: /expand|collapse/i,
        });
        expect(expandButtons).toHaveLength(2);
      });
    });

    it('should expand step to show inputs when clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Inputs')).toBeInTheDocument();
        expect(screen.getByText(/input-file/i)).toBeInTheDocument();
        expect(
          screen.getByText(/s3:\/\/bucket\/data\.csv/i),
        ).toBeInTheDocument();
        expect(screen.getByText(/batch-size/i)).toBeInTheDocument();
        expect(screen.getByText('1000')).toBeInTheDocument();
      });
    });

    it('should expand step to show outputs when clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Outputs')).toBeInTheDocument();
        expect(screen.getByText(/processed-records/i)).toBeInTheDocument();
        expect(screen.getByText('5432')).toBeInTheDocument();
      });
    });

    it('should show error message for failed steps', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockFailedWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      const failedSessionButton = screen.getByRole('button', {
        name: /failed-workflow-456/i,
      });
      await user.click(failedSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Message')).toBeInTheDocument();
        expect(
          screen.getByText(/Connection timeout to database server/i),
        ).toBeInTheDocument();
      });
    });

    it('should collapse step details when clicked again', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Inputs')).toBeInTheDocument();
      });

      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
      });
    });

    it('should display exit code for failed steps', async () => {
      const user = userEvent.setup();
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockFailedWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      const failedSessionButton = screen.getByRole('button', {
        name: /failed-workflow-456/i,
      });
      await user.click(failedSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        const detailsSection = screen.getByText('Message');
        expect(detailsSection).toBeInTheDocument();
      });
    });
  });

  describe('Template Filter', () => {
    it('should show template dropdown with available templates', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      await user.click(templateInput);

      await waitFor(() => {
        expect(
          screen.getByText('data-processing-template'),
        ).toBeInTheDocument();
        expect(screen.getByText('ml-training-template')).toBeInTheDocument();
      });
    });

    it('should filter template dropdown based on search input', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      await user.type(templateInput, 'ml');

      await waitFor(() => {
        expect(screen.getByText('ml-training-template')).toBeInTheDocument();
        expect(
          screen.queryByText('data-processing-template'),
        ).not.toBeInTheDocument();
      });
    });

    it('should select template from dropdown', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      await user.click(templateInput);

      const mlTemplate = await screen.findByText('ml-training-template');
      await user.click(mlTemplate);

      await waitFor(() => {
        expect(templateInput).toHaveValue('ml-training-template');
        const lastCall =
          mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            workflowTemplateName: 'ml-training-template',
          }),
        );
      });
    });

    it('should show message when no templates available', () => {
      vi.mocked(useGetAllWorkflowTemplates).mockReturnValue({
        data: [],
        isPending: false,
      } as any);

      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      templateInput.focus();

      waitFor(() => {
        expect(
          screen.getByText(/No workflow templates found/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('URL State Management', () => {
    it('should update URL when workflow name filter changes', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('workflowName=test'),
          expect.any(Object),
        );
      });
    });

    it('should update URL when status filter changes', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const statusSelect = screen.getByRole('combobox', { name: 'Status' });
      await user.click(statusSelect);

      const failedOption = await screen.findByRole('option', {
        name: /failed/i,
      });
      await user.click(failedOption);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('status=failed'),
          expect.any(Object),
        );
      });
    });

    it('should clear URL params when filters are cleared', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('workflowName=test'),
          expect.any(Object),
        );
      });

      resetAppRouterMock('workflowName=test');

      const clearButton = screen.getByRole('button', {
        name: /clear filters/i,
      });
      await user.click(clearButton);

      await waitFor(() => {
        const lastCall =
          mockRouter.replace.mock.calls[
            mockRouter.replace.mock.calls.length - 1
          ];
        expect(lastCall[0]).not.toContain('workflowName');
      });
    });

    it('should not replace URL when it already matches current filters', async () => {
      resetAppRouterMock('workflowName=test');

      render(<SessionsSection />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('test')).toBeInTheDocument();
      });

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('Session Detail View', () => {
    it('deep-links to a run via ?run= even when it is not on the loaded page', async () => {
      resetAppRouterMock('run=brand-new-workflow-xyz123');
      const deepLinkedWorkflow = {
        ...mockWorkflow,
        metadata: {
          ...mockWorkflow.metadata,
          name: 'brand-new-workflow-xyz123',
        },
      };
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: deepLinkedWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        expect(
          screen.getAllByText('brand-new-workflow-xyz123').length,
        ).toBeGreaterThanOrEqual(1);
      });
      expect(useWorkflow).toHaveBeenCalledWith(
        'default',
        'brand-new-workflow-xyz123',
        undefined,
        0,
      );
      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          '/workflow-runs',
          expect.any(Object),
        );
      });
      expect(vi.mocked(useWorkflow).mock.lastCall).toEqual([
        'default',
        'brand-new-workflow-xyz123',
        undefined,
        0,
      ]);
    });

    it('should display selected session name in list and detail view', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        const headers = screen.getAllByText('test-workflow-123');
        expect(headers.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should show workflow status badge in list and detail view', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        const succeededBadges = screen.getAllByText('Succeeded');
        expect(succeededBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should display step tree structure with all steps', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
        expect(screen.getByText('Validate Output')).toBeInTheDocument();
      });
    });

    it('should show Argo Workflows link with correct URL format', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        const argoLink = screen.getByRole('link', { name: /view in argo/i });
        expect(argoLink).toHaveAttribute(
          'href',
          'http://localhost:2746/workflows/default/test-workflow-123?uid=abc-123-def',
        );
        expect(argoLink).toHaveAttribute('target', '_blank');
        expect(argoLink).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('should display workflow duration in list and detail view', async () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await waitFor(() => {
        const durationElements = screen.getAllByText(/5m 30s/);
        expect(durationElements.length).toBeGreaterThan(0);
      });
    });

    it('should show loading indicator when fetching detail', () => {
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: null,
        loading: true,
        error: null,
      } as any);

      render(<SessionsSection />);

      const loadingText = screen.queryByText(/updating/i);
      expect(loadingText).toBeInTheDocument();
    });
  });

  describe('Namespace scoping', () => {
    beforeEach(() => {
      mockUseNamespace.mockReturnValue({
        namespace: 'tenant-alpha',
        isNamespaceResolved: true,
        isPending: false,
        readOnlyMode: false,
      });
    });

    it('lists workflows from the active namespace, not a hardcoded default', () => {
      render(<SessionsSection />);

      expect(useWorkflows).toHaveBeenCalledWith(
        'tenant-alpha',
        expect.any(Object),
        undefined,
        expect.any(Function),
      );
      expect(useWorkflows).not.toHaveBeenCalledWith(
        'default',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('fetches workflow detail from the active namespace', () => {
      render(<SessionsSection />);

      expect(useWorkflow).toHaveBeenCalledWith(
        'tenant-alpha',
        expect.any(String),
      );
    });
  });

  describe('Team Sessions', () => {
    const teamSession = {
      id: 'team-session-1',
      name: 'team-session-1',
      type: 'team',
      status: 'running',
      startedAt: '2024-01-15T10:00:00Z',
      duration: '2m 10s',
      steps: [
        {
          id: 'step-orchestrator',
          agentName: 'orchestrator-agent',
          displayName: 'Plan work',
          type: 'orchestrator',
          status: 'succeeded',
          duration: '10s',
          detail: { model: 'gpt-4', tokensUsed: { input: 120, output: 45 } },
          children: [
            {
              id: 'step-writer',
              agentName: 'writer-agent',
              displayName: 'Draft answer',
              type: 'agent',
              status: 'skipped',
              duration: '5s',
              message: 'Skipped by policy',
            },
          ],
        },
        {
          id: 'step-reviewer',
          agentName: 'reviewer-agent',
          displayName: 'reviewer-agent',
          type: 'response',
          status: 'pending',
        },
        {
          id: 'step-monitor',
          agentName: 'monitor-agent',
          displayName: 'Watch progress',
          type: 'agent',
          status: 'running',
          duration: '30s',
        },
      ],
    };

    beforeEach(() => {
      vi.mocked(mapArgoWorkflowsToSessions).mockReturnValue([
        teamSession,
      ] as any);
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: null,
        loading: false,
        error: null,
      } as any);
    });

    it('should render team steps with the agent name as a subtitle', () => {
      render(<SessionsSection />);

      expect(screen.getByText('Plan work')).toBeInTheDocument();
      expect(screen.getByText('orchestrator-agent')).toBeInTheDocument();
      expect(screen.getByText('Watch progress')).toBeInTheDocument();
      expect(screen.getByText('reviewer-agent')).toBeInTheDocument();
    });

    it('should keep child steps collapsed until the parent is expanded', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      expect(screen.queryByText('Draft answer')).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /Plan work, expand/i }),
      );

      expect(screen.getByText('Draft answer')).toBeInTheDocument();
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });

    it('should show a team step message when the step is expanded', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      await user.click(
        screen.getByRole('button', { name: /Plan work, expand/i }),
      );
      await user.click(
        screen.getByRole('button', { name: /Draft answer, expand/i }),
      );

      expect(screen.getByText('Skipped by policy')).toBeInTheDocument();
    });
  });

  describe('Uncovered branches', () => {
    it('should seed filters from the URL and keep the namespace param', () => {
      resetAppRouterMock('namespace=ns-1&status=failed');

      render(<SessionsSection />);

      const lastCall =
        vi.mocked(useWorkflows).mock.calls[
          vi.mocked(useWorkflows).mock.calls.length - 1
        ];
      expect(lastCall[1]).toEqual(
        expect.objectContaining({ status: 'Failed' }),
      );
    });

    it('should open the template dropdown on typing and close it on an outside click', async () => {
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('All templates');
      fireEvent.change(templateInput, { target: { value: 'zzz' } });

      await waitFor(() => {
        expect(screen.getByText(/No templates match/i)).toBeInTheDocument();
      });

      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(
          screen.queryByText(/No templates match/i),
        ).not.toBeInTheDocument();
      });
    });

    it('should flatten parallel step groups and nest expandable children', async () => {
      const user = userEvent.setup();
      vi.mocked(mapArgoWorkflowsToSessions).mockReturnValue([
        {
          id: 'tree-workflow',
          name: 'tree-workflow',
          type: 'workflow',
          status: 'succeeded',
          startedAt: '2024-01-15T10:00:00Z',
          duration: '1m',
          steps: [
            {
              id: 'group',
              name: '[0]',
              displayName: '[0]',
              type: 'steps',
              status: 'succeeded',
              children: [
                {
                  id: 'fan-a',
                  name: 'fan-a',
                  displayName: 'fan-a',
                  type: 'container',
                  status: 'succeeded',
                },
                {
                  id: 'fan-b',
                  name: 'fan-b',
                  displayName: 'fan-b',
                  type: 'container',
                  status: 'succeeded',
                },
              ],
            },
            {
              id: 'parent',
              name: 'parent',
              displayName: 'nested-parent',
              type: 'dag',
              status: 'succeeded',
              children: [
                {
                  id: 'child',
                  name: 'child',
                  displayName: 'nested-child',
                  type: 'container',
                  status: 'succeeded',
                },
              ],
            },
          ],
        },
      ] as any);
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: null,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      expect(screen.getByText('fan-a')).toBeInTheDocument();
      expect(screen.getByText('fan-b')).toBeInTheDocument();
      expect(screen.queryByText('[0]')).not.toBeInTheDocument();
      expect(screen.queryByText('nested-child')).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /nested-parent, expand/i }),
      );

      expect(screen.getByText('nested-child')).toBeInTheDocument();
    });

    it('should report an error when step logs cannot be loaded', async () => {
      const user = userEvent.setup();
      vi.mocked(fetchNodeLogWindow).mockRejectedValue(
        new APIError('Logs are no longer available for this node', 404),
      );
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: mockWorkflow,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      const expandButton = screen.getAllByRole('button', {
        name: /expand/i,
      })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Logs are no longer available/i),
        ).toBeInTheDocument();
      });
    });

    it('should render fetched step logs and skip fetching without pod details', async () => {
      const user = userEvent.setup();
      vi.mocked(fetchNodeLogWindow).mockResolvedValueOnce({
        content: 'archived log line',
        line_count: 1,
        byte_count: 18,
        has_more_before: false,
        truncated: false,
        first_timestamp: null,
        last_timestamp: null,
      });
      vi.mocked(mapArgoWorkflowsToSessions).mockReturnValue([
        {
          id: 'logs-workflow',
          name: 'logs-workflow',
          type: 'workflow',
          status: 'succeeded',
          startedAt: '2024-01-15T10:00:00Z',
          duration: '1m',
          steps: [
            {
              id: 'with-logs',
              name: 'with-logs',
              displayName: 'with-logs',
              type: 'container',
              status: 'succeeded',
              detail: {
                podName: 'logs-workflow-with-logs-123',
                workflowName: 'logs-workflow',
                nodeId: 'node-1',
                namespace: 'default',
              },
            },
            {
              id: 'no-logs',
              name: 'no-logs',
              displayName: 'no-logs',
              type: 'container',
              status: 'succeeded',
              detail: { image: 'alpine:3.20' },
            },
          ],
        },
      ] as any);
      vi.mocked(useWorkflow).mockReturnValue({
        workflow: null,
        loading: false,
        error: null,
      } as any);

      render(<SessionsSection />);

      await user.click(
        screen.getByRole('button', { name: /with-logs, expand/i }),
      );

      await waitFor(() => {
        expect(screen.getByText('archived log line')).toBeInTheDocument();
      });
      expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
      expect(fetchNodeLogWindow).toHaveBeenCalledWith(
        {
          namespace: 'default',
          workflowName: 'logs-workflow',
          nodeId: 'node-1',
          podName: 'logs-workflow-with-logs-123',
        },
        expect.anything(),
      );

      await user.click(
        screen.getByRole('button', { name: /no-logs, expand/i }),
      );

      expect(screen.getByText('alpine:3.20')).toBeInTheDocument();
      expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step log polling', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function expandStepWithStatus(status: MappedStepStatus) {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({
        advanceTimers: vi.advanceTimersByTime,
      });
      vi.mocked(fetchNodeLogWindow).mockResolvedValue({
        content: 'log line',
        line_count: 1,
        byte_count: 8,
        has_more_before: false,
        truncated: false,
        first_timestamp: null,
        last_timestamp: 't1',
      });
      vi.mocked(mapArgoWorkflowsToSessions).mockReturnValue([
        {
          id: 'poll-workflow',
          name: 'poll-workflow',
          type: 'workflow' as const,
          status,
          startedAt: '2024-01-15T10:00:00Z',
          duration: '1m',
          steps: [
            {
              id: 'poll-step',
              name: 'poll-step',
              displayName: 'poll-step',
              type: 'container' as const,
              status,
              detail: {
                podName: 'poll-workflow-poll-step-123',
                workflowName: 'poll-workflow',
                nodeId: 'node-1',
                namespace: 'default',
              },
            },
          ],
        },
      ]);

      render(<SessionsSection />);

      await user.click(
        screen.getByRole('button', { name: /poll-step, expand/i }),
      );

      await waitFor(() => {
        expect(screen.getByText('log line')).toBeInTheDocument();
      });
      expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
    }

    it('should keep polling logs for a running step', async () => {
      await expandStepWithStatus('running');

      expect(vi.mocked(fetchNodeLogWindow).mock.calls.length).toBeGreaterThan(
        1,
      );
    });

    it('should fetch logs once for a finished step', async () => {
      await expandStepWithStatus('succeeded');

      expect(fetchNodeLogWindow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pagination', () => {
    it('should disable Previous on the first page and enable Next when more pages exist', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        page: 0,
        hasNext: true,
        hasPrevious: false,
        goToNextPage: vi.fn(),
        goToPreviousPage: vi.fn(),
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(
        screen.getByRole('button', { name: /go to previous page/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: /go to next page/i }),
      ).toBeEnabled();
    });

    it('should disable Next on the last page and enable Previous', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        page: 1,
        hasNext: false,
        hasPrevious: true,
        goToNextPage: vi.fn(),
        goToPreviousPage: vi.fn(),
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      expect(
        screen.getByRole('button', { name: /go to previous page/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole('button', { name: /go to next page/i }),
      ).toBeDisabled();
    });

    it('should call goToNextPage and goToPreviousPage when clicked', async () => {
      const user = userEvent.setup();
      const goToNextPage = vi.fn();
      const goToPreviousPage = vi.fn();
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        page: 1,
        hasNext: true,
        hasPrevious: true,
        goToNextPage,
        goToPreviousPage,
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      await user.click(
        screen.getByRole('button', { name: /go to next page/i }),
      );
      expect(goToNextPage).toHaveBeenCalledTimes(1);

      await user.click(
        screen.getByRole('button', { name: /go to previous page/i }),
      );
      expect(goToPreviousPage).toHaveBeenCalledTimes(1);
    });
  });
});
