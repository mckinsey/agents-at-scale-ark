import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import type { WorkflowTemplate } from '@/lib/services/workflow-templates';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    list: vi.fn(),
  },
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: vi.fn(loading => loading),
}));

vi.mock('@/components/rows/flow-row', () => ({
  FlowRow: vi.fn(({ flow }) => (
    <div data-testid="flow-row">
      <div>{flow.id}</div>
      {flow.title && <div>{flow.title}</div>}
      {flow.description && <div>{flow.description}</div>}
      <div>{flow.stages} stages</div>
    </div>
  )),
}));

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="empty">{children}</div>
  ),
  EmptyHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  EmptyMedia: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  EmptyTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  EmptyDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  EmptyContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/lib/constants', () => ({
  DASHBOARD_SECTIONS: {
    'workflow-templates': {
      icon: () => <div>WorkflowIcon</div>,
    },
  },
}));

describe('WorkflowTemplatesSection', () => {
  const mockTemplates: WorkflowTemplate[] = [
    {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'WorkflowTemplate',
      metadata: {
        name: 'simple-workflow',
        namespace: 'default',
      },
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
    {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'WorkflowTemplate',
      metadata: {
        name: 'another-workflow',
        namespace: 'default',
        annotations: {
          'workflows.argoproj.io/title': 'Invoice Processing',
        },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('should display loading state initially', async () => {
      vi.mocked(workflowTemplatesService.list).mockImplementation(
        () => new Promise(() => {}),
      );

      render(<WorkflowTemplatesSection />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Successful data loading', () => {
    it('should load and display workflow templates', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('simple-workflow')).toBeInTheDocument();
        expect(screen.getByText('composer-workflow')).toBeInTheDocument();
        expect(screen.getByText('another-workflow')).toBeInTheDocument();
      });
    });

    it('should display workflow with title and description', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Data Processing Pipeline'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('A workflow for processing customer data'),
        ).toBeInTheDocument();
      });
    });

    it('should display workflow with only title', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('Invoice Processing')).toBeInTheDocument();
      });
    });

    it('should render correct number of flow rows', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        const flowRows = screen.getAllByTestId('flow-row');
        expect(flowRows).toHaveLength(3);
      });
    });
  });

  describe('Empty state', () => {
    it('should display empty state when no templates exist', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByTestId('empty')).toBeInTheDocument();
        expect(
          screen.getByText('No Workflow Templates Yet'),
        ).toBeInTheDocument();
      });
    });

    it('should show helpful message in empty state', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(
          screen.getByText(/You haven't created any workflow templates yet/i),
        ).toBeInTheDocument();
      });
    });

    it('should display workflow icon in empty state', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('WorkflowIcon')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should handle fetch error and show empty state', async () => {
      const error = new Error('Failed to fetch templates');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(workflowTemplatesService.list).mockRejectedValue(error);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByTestId('empty')).toBeInTheDocument();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to fetch workflow templates:',
          error,
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('should log error to console on failure', async () => {
      const error = new Error('Network error');
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(workflowTemplatesService.list).mockRejectedValue(error);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Template mapping', () => {
    it('should map template without annotations correctly', async () => {
      const templateWithoutAnnotations: WorkflowTemplate[] = [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: {
            name: 'basic-template',
            namespace: 'default',
          },
        },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        templateWithoutAnnotations,
      );

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('basic-template')).toBeInTheDocument();
      });
    });

    it('should handle template with empty annotations object', async () => {
      const templateWithEmptyAnnotations: WorkflowTemplate[] = [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: {
            name: 'empty-annotations',
            namespace: 'default',
            annotations: {},
          },
        },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        templateWithEmptyAnnotations,
      );

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('empty-annotations')).toBeInTheDocument();
      });
    });

    it('should extract title annotation correctly', async () => {
      const templateWithTitle: WorkflowTemplate[] = [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: {
            name: 'titled-workflow',
            namespace: 'default',
            annotations: {
              'workflows.argoproj.io/title': 'My Workflow Title',
            },
          },
        },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        templateWithTitle,
      );

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('My Workflow Title')).toBeInTheDocument();
      });
    });

    it('should extract description annotation correctly', async () => {
      const templateWithDescription: WorkflowTemplate[] = [
        {
          apiVersion: 'argoproj.io/v1alpha1',
          kind: 'WorkflowTemplate',
          metadata: {
            name: 'described-workflow',
            namespace: 'default',
            annotations: {
              'workflows.argoproj.io/description': 'Workflow description here',
            },
          },
        },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        templateWithDescription,
      );

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Workflow description here'),
        ).toBeInTheDocument();
      });
    });

    it('should set stages to 0 for all workflows', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        const stageTexts = screen.getAllByText(/0 stages/);
        expect(stageTexts).toHaveLength(3);
      });
    });
  });

  describe('Component lifecycle', () => {
    it('should fetch templates only once on mount', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      const { rerender } = render(<WorkflowTemplatesSection />);

      await waitFor(() => {
        expect(screen.getByText('simple-workflow')).toBeInTheDocument();
      });

      expect(workflowTemplatesService.list).toHaveBeenCalledTimes(1);

      rerender(<WorkflowTemplatesSection />);

      expect(workflowTemplatesService.list).toHaveBeenCalledTimes(1);
    });

    it('should transition from loading to content state', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue(mockTemplates);

      render(<WorkflowTemplatesSection />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.getByText('simple-workflow')).toBeInTheDocument();
      });
    });

    it('should transition from loading to empty state', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      render(<WorkflowTemplatesSection />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.getByTestId('empty')).toBeInTheDocument();
      });
    });
  });
});
