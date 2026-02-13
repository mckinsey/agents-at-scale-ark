import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Flow } from '@/components/rows/flow-row';
import { FlowRow } from '@/components/rows/flow-row';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children?: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('lucide-react', () => ({
  Workflow: () => <div data-testid="workflow-icon">WorkflowIcon</div>,
  Play: () => <div data-testid="play-icon">PlayIcon</div>,
  Trash2: () => <div data-testid="trash-icon">TrashIcon</div>,
  ExternalLink: () => <div data-testid="external-link-icon">ExternalLinkIcon</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
  }) => (
    <button onClick={onClick} data-as-child={asChild}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/dialogs/delete-workflow-template-dialog', () => ({
  DeleteWorkflowTemplateDialog: () => <div data-testid="delete-dialog">DeleteDialog</div>,
}));

vi.mock('@/components/dialogs/run-workflow-dialog', () => ({
  RunWorkflowDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    readOnlyMode: false,
    availableNamespaces: [],
    createNamespace: vi.fn(),
    isPending: false,
    isNamespaceResolved: true,
    setNamespace: vi.fn(),
  })),
}));

describe('FlowRow', () => {
  const baseFlow: Flow = {
    id: 'test-flow-123',
    stages: 3,
  };

  describe('Basic rendering', () => {
    it('should render flow id', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.getByText('test-flow-123')).toBeInTheDocument();
    });

    it('should render workflow icon', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();
    });

    it('should render external link button', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.getByTestId('external-link-icon')).toBeInTheDocument();
    });

    it('should create link to flow detail page', () => {
      render(<FlowRow flow={baseFlow} />);

      const links = screen.getAllByRole('link');
      const detailPageLink = links.find(link => link.getAttribute('href')?.startsWith('/workflow-templates/'));
      expect(detailPageLink).toHaveAttribute('href', '/workflow-templates/test-flow-123');
    });
  });

  describe('Title and description', () => {
    it('should render title when provided', () => {
      const flowWithTitle: Flow = {
        ...baseFlow,
        title: 'Data Processing Pipeline',
      };

      render(<FlowRow flow={flowWithTitle} />);

      expect(screen.getByText('Data Processing Pipeline')).toBeInTheDocument();
    });

    it('should not render title when not provided', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.queryByText(/Pipeline/)).not.toBeInTheDocument();
    });

    it('should render description when provided', () => {
      const flowWithDescription: Flow = {
        ...baseFlow,
        description: 'Processes customer data for analytics',
      };

      render(<FlowRow flow={flowWithDescription} />);

      expect(
        screen.getByText('Processes customer data for analytics'),
      ).toBeInTheDocument();
    });

    it('should not render description when not provided', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.queryByText(/Processes/)).not.toBeInTheDocument();
    });

    it('should render both title and description when provided', () => {
      const flowWithBoth: Flow = {
        ...baseFlow,
        title: 'Invoice Processing',
        description: 'Automated invoice extraction and validation',
      };

      render(<FlowRow flow={flowWithBoth} />);

      expect(screen.getByText('Invoice Processing')).toBeInTheDocument();
      expect(
        screen.getByText('Automated invoice extraction and validation'),
      ).toBeInTheDocument();
    });
  });

  describe('Action buttons', () => {
    it('should render run button when onRun is provided', () => {
      const onRun = vi.fn();
      render(<FlowRow flow={baseFlow} onRun={onRun} />);

      expect(screen.getByTestId('play-icon')).toBeInTheDocument();
    });

    it('should not render run button when onRun is not provided', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.queryByTestId('play-icon')).not.toBeInTheDocument();
    });

    it('should render delete button when onDelete is provided', () => {
      const onDelete = vi.fn();
      render(<FlowRow flow={baseFlow} onDelete={onDelete} />);

      expect(screen.getByTestId('trash-icon')).toBeInTheDocument();
    });

    it('should not render delete button when onDelete is not provided', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.queryByTestId('trash-icon')).not.toBeInTheDocument();
    });
  });

  describe('Truncation and title attributes', () => {
    it('should add title attribute to flow id for truncation', () => {
      const flowWithLongId: Flow = {
        ...baseFlow,
        id: 'very-long-flow-id-that-might-need-truncation-12345',
      };

      render(<FlowRow flow={flowWithLongId} />);

      const idElement = screen.getByText(
        'very-long-flow-id-that-might-need-truncation-12345',
      );
      expect(idElement).toHaveAttribute(
        'title',
        'very-long-flow-id-that-might-need-truncation-12345',
      );
    });

    it('should add title attribute to title for truncation', () => {
      const flowWithLongTitle: Flow = {
        ...baseFlow,
        title:
          'This is a very long title that will definitely need to be truncated in the UI',
      };

      render(<FlowRow flow={flowWithLongTitle} />);

      const titleElement = screen.getByText(
        'This is a very long title that will definitely need to be truncated in the UI',
      );
      expect(titleElement).toHaveAttribute(
        'title',
        'This is a very long title that will definitely need to be truncated in the UI',
      );
    });

    it('should add title attribute to description for truncation', () => {
      const flowWithLongDescription: Flow = {
        ...baseFlow,
        description:
          'This is a very long description that will definitely need to be truncated when displayed in the flow row component',
      };

      render(<FlowRow flow={flowWithLongDescription} />);

      const descElement = screen.getByText(
        'This is a very long description that will definitely need to be truncated when displayed in the flow row component',
      );
      expect(descElement).toHaveAttribute(
        'title',
        'This is a very long description that will definitely need to be truncated when displayed in the flow row component',
      );
    });
  });

  describe('Complex scenarios', () => {
    it('should render complete flow with all properties', () => {
      const completeFlow: Flow = {
        id: 'complete-workflow-abc-123',
        title: 'Complete ML Pipeline',
        description: 'End-to-end machine learning workflow with validation',
        stages: 5,
      };

      render(<FlowRow flow={completeFlow} />);

      expect(screen.getByText('complete-workflow-abc-123')).toBeInTheDocument();
      expect(screen.getByText('Complete ML Pipeline')).toBeInTheDocument();
      expect(
        screen.getByText(
          'End-to-end machine learning workflow with validation',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();

      const links = screen.getAllByRole('link');
      const detailPageLink = links.find(link => link.getAttribute('href')?.startsWith('/workflow-templates/'));
      expect(detailPageLink).toHaveAttribute(
        'href',
        '/workflow-templates/complete-workflow-abc-123',
      );
    });

    it('should handle flow with special characters in id', () => {
      const flowWithSpecialChars: Flow = {
        ...baseFlow,
        id: 'flow-with_underscores-and.dots',
      };

      render(<FlowRow flow={flowWithSpecialChars} />);

      expect(
        screen.getByText('flow-with_underscores-and.dots'),
      ).toBeInTheDocument();
      const links = screen.getAllByRole('link');
      const detailPageLink = links.find(link => link.getAttribute('href')?.startsWith('/workflow-templates/'));
      expect(detailPageLink).toHaveAttribute(
        'href',
        '/workflow-templates/flow-with_underscores-and.dots',
      );
    });

    it('should handle flow with unicode characters in title and description', () => {
      const flowWithUnicode: Flow = {
        ...baseFlow,
        title: 'データ処理パイプライン',
        description: 'Process data with émojis 🚀 and spëcial çharacters',
      };

      render(<FlowRow flow={flowWithUnicode} />);

      expect(screen.getByText('データ処理パイプライン')).toBeInTheDocument();
      expect(
        screen.getByText('Process data with émojis 🚀 and spëcial çharacters'),
      ).toBeInTheDocument();
    });
  });
});
