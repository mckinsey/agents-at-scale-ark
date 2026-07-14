import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    getYaml: vi.fn(),
    save: vi.fn(),
    nameExists: vi.fn(),
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
  useNamespace: () => ({ namespace: 'default' }),
}));

vi.mock('@/lib/services/author-agent-preflight', () => ({
  getAuthorAgentPreflight: vi.fn(async () => ({
    agentPresent: true,
    agentReady: true,
    mcpServerPresent: true,
    mcpServerReady: true,
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
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const validYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: placeholder',
  'spec:',
  '  entrypoint: main',
].join('\n');

function enterYaml(yamlText: string) {
  fireEvent.click(screen.getByTestId('studio-view-yaml'));
  const editor = screen.getByTestId('studio-yaml-editor');
  fireEvent.change(editor, { target: { value: yamlText } });
}

describe('WorkflowStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('name modal', () => {
    it('shows the name modal on /new without a name', () => {
      render(<WorkflowStudio mode="new" />);
      expect(screen.getByText('Name your workflow template')).toBeInTheDocument();
    });

    it('hides the name modal on /new when a name is provided', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.queryByText('Name your workflow template')).not.toBeInTheDocument();
    });
  });

  describe('save on /new', () => {
    it('creates without collision and navigates to the studio route', async () => {
      vi.mocked(workflowTemplatesService.nameExists).mockResolvedValue(false);
      vi.mocked(workflowTemplatesService.save).mockResolvedValue({
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'my-workflow' },
      });

      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      enterYaml(validYaml);

      fireEvent.click(screen.getByTestId('studio-save'));

      await waitFor(() => {
        expect(workflowTemplatesService.save).toHaveBeenCalledTimes(1);
      });

      const [savedYaml, savedMode] = vi.mocked(workflowTemplatesService.save)
        .mock.calls[0];
      expect(savedMode).toBe('create');
      expect(savedYaml).toContain('name: my-workflow');
      expect(savedYaml).not.toContain('placeholder');

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith(
          '/workflow-templates/my-workflow',
        );
      });
    });

    it('prompts to overwrite on collision and updates when confirmed', async () => {
      vi.mocked(workflowTemplatesService.nameExists).mockResolvedValue(true);
      vi.mocked(workflowTemplatesService.save).mockResolvedValue({
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'my-workflow' },
      });

      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      enterYaml(validYaml);

      fireEvent.click(screen.getByTestId('studio-save'));

      await waitFor(() => {
        expect(
          screen.getByTestId('studio-overwrite-confirm'),
        ).toBeInTheDocument();
      });
      expect(workflowTemplatesService.save).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('studio-overwrite-confirm'));

      await waitFor(() => {
        expect(workflowTemplatesService.save).toHaveBeenCalledTimes(1);
      });
      expect(vi.mocked(workflowTemplatesService.save).mock.calls[0][1]).toBe(
        'update',
      );
    });

    it('does not save when overwrite is cancelled', async () => {
      vi.mocked(workflowTemplatesService.nameExists).mockResolvedValue(true);

      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      enterYaml(validYaml);

      fireEvent.click(screen.getByTestId('studio-save'));

      await waitFor(() => {
        expect(
          screen.getByTestId('studio-overwrite-cancel'),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('studio-overwrite-cancel'));

      expect(workflowTemplatesService.save).not.toHaveBeenCalled();
    });
  });

  describe('save on /edit', () => {
    it('updates silently', async () => {
      vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(validYaml);
      vi.mocked(workflowTemplatesService.save).mockResolvedValue({
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'existing-workflow' },
      });

      render(<WorkflowStudio mode="edit" initialName="existing-workflow" />);

      await waitFor(() => {
        expect(screen.getByTestId('studio-view-yaml')).toBeInTheDocument();
      });

      enterYaml(validYaml + '\n  # changed');

      fireEvent.click(screen.getByTestId('studio-save'));

      await waitFor(() => {
        expect(workflowTemplatesService.save).toHaveBeenCalledTimes(1);
      });
      expect(vi.mocked(workflowTemplatesService.save).mock.calls[0][1]).toBe(
        'update',
      );
      expect(workflowTemplatesService.nameExists).not.toHaveBeenCalled();
    });
  });

  describe('layout', () => {
    it('renders the studio title and breadcrumb crumb', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.getByText('Workflow studio')).toBeInTheDocument();
      expect(screen.getByText('my-workflow')).toBeInTheDocument();
    });

    it('shows a Create primary in new mode and no Run', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.getByTestId('studio-create')).toBeInTheDocument();
      expect(screen.queryByTestId('studio-run')).not.toBeInTheDocument();
    });

    it('shows a Run primary in persisted edit mode and no Create', async () => {
      vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(validYaml);
      render(<WorkflowStudio mode="edit" initialName="existing-workflow" />);
      await waitFor(() => {
        expect(screen.getByTestId('studio-run')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('studio-create')).not.toBeInTheDocument();
    });

    it('renders the draggable resize handle between chat and canvas', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.getByTestId('studio-chat-slot')).toBeInTheDocument();
      expect(screen.getByTestId('studio-resize-handle')).toBeInTheDocument();
    });

    it('renders the diagram empty state before any YAML', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.getByTestId('studio-diagram-empty')).toBeInTheDocument();
    });

    it('shows the dirty dot once the draft diverges', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(
        screen.queryByTestId('studio-dirty-badge'),
      ).not.toBeInTheDocument();
      enterYaml(validYaml);
      expect(screen.getByTestId('studio-dirty-badge')).toBeInTheDocument();
    });

    it('surfaces the YAML banner when the manifest is invalid', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      enterYaml('foo: bar');
      expect(screen.getByTestId('studio-yaml-banner')).toBeInTheDocument();
    });
  });

  describe('save guards', () => {
    it('disables save when the draft is empty', () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      expect(screen.getByTestId('studio-save')).toBeDisabled();
    });

    it('blocks save with a toast when the YAML is invalid', async () => {
      render(<WorkflowStudio mode="new" initialName="my-workflow" />);
      enterYaml('foo: bar: baz');

      fireEvent.click(screen.getByTestId('studio-save'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      const message = vi.mocked(toast.error).mock.calls[0][0];
      expect(String(message)).toContain('Fix the YAML before saving');
      expect(workflowTemplatesService.save).not.toHaveBeenCalled();
    });
  });
});
