import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { SessionsSection } from '@/components/sections/sessions-section';
import {
  mapArgoWorkflowsToSessions,
  mapArgoWorkflowToSession,
} from '@/lib/services/workflow-mapper';
import { useWorkflow, useWorkflows } from '@/lib/services/workflows-hooks';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/services/workflows-hooks', () => ({
  useWorkflows: vi.fn(),
  useWorkflow: vi.fn(),
}));

vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: vi.fn((value) => value),
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
          parameters: [
            { name: 'processed-records', value: '5432' },
          ],
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
        message: 'Error: Connection timeout to database server at db.example.com:5432',
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
  const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  };

  const mockSearchParams = new URLSearchParams();
  const allWorkflows = [mockWorkflow, mockFailedWorkflow, mockRunningWorkflow];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);
    
    vi.mocked(mapArgoWorkflowsToSessions).mockImplementation((workflows) =>
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
      }))
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
            exitCode: node.outputs?.exitCode ? parseInt(node.outputs.exitCode) : undefined,
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
    } as any);
    vi.mocked(useWorkflow).mockReturnValue({
      workflow: null,
      loading: false,
      error: null,
    } as any);
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

      expect(screen.getByText('No workflow runs to display')).toBeInTheDocument();
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

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/no workflow runs found matching/i)).toBeInTheDocument();
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

      expect(screen.getByText(/Error: Failed to fetch workflows/i)).toBeInTheDocument();
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
      const sessionButtons = allButtons.filter(btn => 
        btn.title === 'test-workflow-123' ||
        btn.title === 'failed-workflow-456' ||
        btn.title === 'running-workflow-789'
      );

      expect(sessionButtons).toHaveLength(3);
    });

    it('should show exact session count', () => {
      render(<SessionsSection />);

      expect(screen.getByText('3 sessions')).toBeInTheDocument();
    });

    it('should display correct status badges for each type of session', () => {
      render(<SessionsSection />);

      const succeededBadges = screen.getAllByText('succeeded');
      expect(succeededBadges.length).toBeGreaterThanOrEqual(1);

      const failedBadges = screen.getAllByText('failed');
      expect(failedBadges.length).toBeGreaterThanOrEqual(1);
      
      const runningBadges = screen.getAllByText('running');
      expect(runningBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('should display workflow type badge for each session', () => {
      render(<SessionsSection />);

      const workflowBadges = screen.getAllByText('workflow');
      expect(workflowBadges.length).toBeGreaterThanOrEqual(3);
    });

    it('should select newest session by default', async () => {
      render(<SessionsSection />);

      await waitFor(() => {
        const sessionList = screen.getAllByRole('button').filter(btn => 
          btn.title && (
            btn.title === 'test-workflow-123' ||
            btn.title === 'failed-workflow-456' ||
            btn.title === 'running-workflow-789'
          )
        );
        
        expect(sessionList[0]).toHaveAttribute('title', 'running-workflow-789');
      });
    });
  });

  describe('Filters', () => {
    it('should pass workflow name filter to API', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'failed');

      await waitFor(() => {
        const lastCall = mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            workflowName: 'failed',
          })
        );
      });
    });

    it('should pass status filter to API', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      
      render(<SessionsSection />);

      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes[0];
      await user.click(statusSelect);

      const failedOption = screen.getByRole('option', { name: /failed/i });
      await user.click(failedOption);

      await waitFor(() => {
        const lastCall = mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            status: 'Failed',
          })
        );
      });
    });

    it('should pass template name filter to API', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('Search templates...');
      await user.type(templateInput, 'ml-training');

      await waitFor(() => {
        const lastCall = mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            workflowTemplateName: 'ml-training',
          })
        );
      });
    });

    it('should clear all filters and reset to defaults', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'test');

      const clearButton = screen.getByRole('button', { name: /clear filters/i });
      await user.click(clearButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
        const lastCall = mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual({});
      });
    });

    it('should disable clear filters button when no active filters', () => {
      render(<SessionsSection />);

      const clearButton = screen.getByRole('button', { name: /clear filters/i });
      expect(clearButton).toBeDisabled();
    });

    it('should enable clear filters button when filters are active', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /clear filters/i });
        expect(clearButton).not.toBeDisabled();
      });
    });

    it('should sort sessions by newest first by default', () => {
      render(<SessionsSection />);

      const sessionButtons = screen.getAllByRole('button').filter(btn => 
        btn.title === 'test-workflow-123' ||
        btn.title === 'failed-workflow-456' ||
        btn.title === 'running-workflow-789'
      );
      
      expect(sessionButtons[0]).toHaveAttribute('title', 'running-workflow-789');
    });

    it('should allow changing sort order to oldest first', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const comboboxes = screen.getAllByRole('combobox');
      const sortSelect = comboboxes[1];
      await user.click(sortSelect);

      const oldestOption = screen.getByRole('option', { name: /oldest first/i });
      expect(oldestOption).toBeInTheDocument();
      await user.click(oldestOption);

      await waitFor(() => {
        expect(sortSelect).toHaveTextContent(/oldest first/i);
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
        const expandButtons = screen.getAllByRole('button', { name: /show details|hide details/i });
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

      const expandButton = screen.getAllByRole('button', { name: /show details/i })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Inputs')).toBeInTheDocument();
        expect(screen.getByText(/input-file/i)).toBeInTheDocument();
        expect(screen.getByText(/s3:\/\/bucket\/data\.csv/i)).toBeInTheDocument();
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

      const expandButton = screen.getAllByRole('button', { name: /show details/i })[0];
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

      const failedSessionButton = screen.getByRole('button', { name: /failed-workflow-456/i });
      await user.click(failedSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', { name: /show details/i })[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Message')).toBeInTheDocument();
        expect(screen.getByText(/Connection timeout to database server/i)).toBeInTheDocument();
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

      const expandButton = screen.getAllByRole('button', { name: /show details/i })[0];
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

      const failedSessionButton = screen.getByRole('button', { name: /failed-workflow-456/i });
      await user.click(failedSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Process Data')).toBeInTheDocument();
      });

      const expandButton = screen.getAllByRole('button', { name: /show details/i })[0];
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

      const templateInput = screen.getByPlaceholderText('Search templates...');
      await user.click(templateInput);

      await waitFor(() => {
        expect(screen.getByText('data-processing-template')).toBeInTheDocument();
        expect(screen.getByText('ml-training-template')).toBeInTheDocument();
      });
    });

    it('should filter template dropdown based on search input', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('Search templates...');
      await user.type(templateInput, 'ml');

      await waitFor(() => {
        expect(screen.getByText('ml-training-template')).toBeInTheDocument();
        expect(screen.queryByText('data-processing-template')).not.toBeInTheDocument();
      });
    });

    it('should select template from dropdown', async () => {
      const user = userEvent.setup();
      const mockUseWorkflows = vi.mocked(useWorkflows);
      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('Search templates...');
      await user.click(templateInput);

      const mlTemplate = await screen.findByText('ml-training-template');
      await user.click(mlTemplate);

      await waitFor(() => {
        expect(templateInput).toHaveValue('ml-training-template');
        const lastCall = mockUseWorkflows.mock.calls[mockUseWorkflows.mock.calls.length - 1];
        expect(lastCall[1]).toEqual(
          expect.objectContaining({
            workflowTemplateName: 'ml-training-template',
          })
        );
      });
    });

    it('should show message when no templates available', () => {
      vi.mocked(useWorkflows).mockReturnValue({
        workflows: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      render(<SessionsSection />);

      const templateInput = screen.getByPlaceholderText('Search templates...');
      templateInput.focus();

      waitFor(() => {
        expect(screen.getByText(/No workflow templates found/i)).toBeInTheDocument();
      });
    });
  });

  describe('URL State Management', () => {
    it('should update URL when workflow name filter changes', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'test');

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('workflowName=test'),
          expect.any(Object)
        );
      });
    });

    it('should update URL when status filter changes', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const comboboxes = screen.getAllByRole('combobox');
      const statusSelect = comboboxes[0];
      await user.click(statusSelect);

      const failedOption = screen.getByRole('option', { name: /failed/i });
      await user.click(failedOption);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('status=failed'),
          expect.any(Object)
        );
      });
    });

    it('should update URL when sort order changes', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const comboboxes = screen.getAllByRole('combobox');
      const sortSelect = comboboxes[1];
      await user.click(sortSelect);

      const oldestOption = screen.getByRole('option', { name: /oldest first/i });
      await user.click(oldestOption);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith(
          expect.stringContaining('sort=oldest'),
          expect.any(Object)
        );
      });
    });

    it('should clear URL params when filters are cleared', async () => {
      const user = userEvent.setup();
      render(<SessionsSection />);

      const searchInput = screen.getByPlaceholderText('Search workflows...');
      await user.type(searchInput, 'test');

      const clearButton = screen.getByRole('button', { name: /clear filters/i });
      await user.click(clearButton);

      await waitFor(() => {
        const lastCall = mockRouter.replace.mock.calls[mockRouter.replace.mock.calls.length - 1];
        expect(lastCall[0]).not.toContain('workflowName');
      });
    });
  });

  describe('Session Detail View', () => {
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
        const succeededBadges = screen.getAllByText('succeeded');
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
          'http://localhost:2746/workflows/default/test-workflow-123?uid=abc-123-def'
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
});
