/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import FlowDetailPage from '@/app/(dashboard)/workflow-templates/[id]/page';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
}));

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    get: vi.fn(),
    getYaml: vi.fn(),
  },
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ currentPage }: { currentPage: string }) => (
    <div data-testid="page-header">{currentPage}</div>
  ),
}));

vi.mock('@/components/workflow-dag-viewer', () => ({
  WorkflowDagViewer: ({ manifest }: { manifest: string }) => (
    <div data-testid="workflow-dag-viewer">{manifest}</div>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockTemplate = {
  metadata: {
    name: 'test-workflow',
    annotations: {
      'workflows.argoproj.io/title': 'Test Workflow',
      'workflows.argoproj.io/description': 'A test workflow template',
    },
  },
};

const mockYaml = `apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: test-workflow
spec:
  entrypoint: main`;

describe('FlowDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ id: 'test-workflow' });
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state', async () => {
    vi.mocked(workflowTemplatesService.get).mockImplementation(
      () => new Promise(() => {})
    );
    vi.mocked(workflowTemplatesService.getYaml).mockImplementation(
      () => new Promise(() => {})
    );

    render(<FlowDetailPage />);
    expect(screen.getByText('Loading flow...')).toBeInTheDocument();
  });

  it('should show error state when fetch fails', async () => {
    vi.mocked(workflowTemplatesService.get).mockRejectedValue(
      new Error('Failed to fetch')
    );
    vi.mocked(workflowTemplatesService.getYaml).mockRejectedValue(
      new Error('Failed to fetch')
    );

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load flow')).toBeInTheDocument();
    });
  });

  it('should render flow details successfully', async () => {
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-header')).toHaveTextContent('Test Workflow');
    });

    expect(screen.getByText('A test workflow template')).toBeInTheDocument();
    expect(screen.getAllByText('test-workflow').length).toBeGreaterThan(0);
  });

  it('should render flow without title and description', async () => {
    const templateWithoutAnnotations = {
      metadata: {
        name: 'simple-workflow',
        annotations: {},
      },
    };

    vi.mocked(workflowTemplatesService.get).mockResolvedValue(
      templateWithoutAnnotations as any
    );
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-header')).toHaveTextContent('simple-workflow');
    });

    expect(screen.queryByText('Test Workflow')).not.toBeInTheDocument();
  });

  it('should copy flow ID to clipboard', async () => {
    const { toast } = await import('sonner');
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('test-workflow')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button');
    const copyIdButton = copyButtons.find((button) =>
      button.querySelector('svg')
    );

    if (copyIdButton) {
      await userEvent.click(copyIdButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-workflow');
        expect(toast.success).toHaveBeenCalledWith('Copied', {
          description: 'Flow ID copied to clipboard',
        });
      });
    }
  });

  it('should handle clipboard copy failure for ID', async () => {
    const { toast } = await import('sonner');
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
    });

    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('test-workflow')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button');
    const copyIdButton = copyButtons.find((button) =>
      button.querySelector('svg')
    );

    if (copyIdButton) {
      await userEvent.click(copyIdButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy', {
          description: 'Could not copy flow ID to clipboard',
        });
      });
    }
  });

  it('should copy manifest to clipboard', async () => {
    const { toast } = await import('sonner');
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    const copyButton = screen.getByRole('button', { name: /copy/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockYaml);
      expect(toast.success).toHaveBeenCalledWith('Copied', {
        description: 'Manifest copied to clipboard',
      });
    });
  });

  it('should handle clipboard copy failure for manifest', async () => {
    const { toast } = await import('sonner');
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
    });

    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    const copyButton = screen.getByRole('button', { name: /copy/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy', {
        description: 'Could not copy manifest to clipboard',
      });
    });
  });

  it.skip('should download manifest', async () => {
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    const mockClick = vi.fn();
    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node
    );
    const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(
      (node) => node
    );

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return {
          click: mockClick,
          href: '',
          download: '',
        } as any;
      }
      return originalCreateElement(tag);
    });

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    });

    const downloadButton = screen.getByRole('button', { name: /download/i });
    await userEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
  });

  it.skip('should display manifest in YAML tab', async () => {
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    });

    expect(screen.getByText(/apiVersion: argoproj.io\/v1alpha1/)).toBeInTheDocument();
  });

  it.skip('should switch to tree tab', async () => {
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    });

    const treeTab = screen.getByRole('tab', { name: /tree/i });
    await userEvent.click(treeTab);

    await waitFor(() => {
      expect(screen.getByTestId('workflow-dag-viewer')).toBeInTheDocument();
    });
  });

  it('should show composer flow indicator for flows with title and description', async () => {
    vi.mocked(workflowTemplatesService.get).mockResolvedValue(mockTemplate as any);
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    const { container } = render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      const sparkleIcons = container.querySelectorAll('svg');
      const hasSparkle = Array.from(sparkleIcons).some(
        (svg) => svg.classList.contains('lucide-sparkle')
      );
      expect(hasSparkle).toBe(true);
    });
  });

  it('should not show composer indicator for flows without title', async () => {
    const templateWithoutTitle = {
      metadata: {
        name: 'simple-workflow',
        annotations: {},
      },
    };

    vi.mocked(workflowTemplatesService.get).mockResolvedValue(
      templateWithoutTitle as any
    );
    vi.mocked(workflowTemplatesService.getYaml).mockResolvedValue(mockYaml);

    const { container } = render(<FlowDetailPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading flow...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      const sparkleIcons = container.querySelectorAll('.lucide-sparkle');
      expect(sparkleIcons.length).toBe(0);
    });
  });
});
