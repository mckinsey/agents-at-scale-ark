import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Flow } from '@/components/rows/flow-row';
import { FlowRow } from '@/components/rows/flow-row';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('lucide-react', () => ({
  Workflow: () => <div data-testid="workflow-icon">WorkflowIcon</div>,
  Sparkle: () => <div data-testid="sparkle-icon">SparkleIcon</div>,
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

    it('should render stages count', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('stages')).toBeInTheDocument();
    });

    it('should create link to flow detail page', () => {
      render(<FlowRow flow={baseFlow} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/workflow-templates/test-flow-123');
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

  describe('Composer flow (Sparkle badge)', () => {
    it('should show sparkle badge when flow has both title and description', () => {
      const composerFlow: Flow = {
        ...baseFlow,
        title: 'ML Training Pipeline',
        description: 'Trains machine learning models with validation',
      };

      render(<FlowRow flow={composerFlow} />);

      expect(screen.getByTestId('sparkle-icon')).toBeInTheDocument();
    });

    it('should not show sparkle badge when flow has only title', () => {
      const flowWithTitleOnly: Flow = {
        ...baseFlow,
        title: 'Simple Flow',
      };

      render(<FlowRow flow={flowWithTitleOnly} />);

      expect(screen.queryByTestId('sparkle-icon')).not.toBeInTheDocument();
    });

    it('should not show sparkle badge when flow has only description', () => {
      const flowWithDescriptionOnly: Flow = {
        ...baseFlow,
        description: 'Some description',
      };

      render(<FlowRow flow={flowWithDescriptionOnly} />);

      expect(screen.queryByTestId('sparkle-icon')).not.toBeInTheDocument();
    });

    it('should not show sparkle badge when flow has neither title nor description', () => {
      render(<FlowRow flow={baseFlow} />);

      expect(screen.queryByTestId('sparkle-icon')).not.toBeInTheDocument();
    });

    it('should not show sparkle badge when title is empty string', () => {
      const flowWithEmptyTitle: Flow = {
        ...baseFlow,
        title: '',
        description: 'Some description',
      };

      render(<FlowRow flow={flowWithEmptyTitle} />);

      expect(screen.queryByTestId('sparkle-icon')).not.toBeInTheDocument();
    });

    it('should not show sparkle badge when description is empty string', () => {
      const flowWithEmptyDescription: Flow = {
        ...baseFlow,
        title: 'Some title',
        description: '',
      };

      render(<FlowRow flow={flowWithEmptyDescription} />);

      expect(screen.queryByTestId('sparkle-icon')).not.toBeInTheDocument();
    });
  });

  describe('Stages display', () => {
    it('should display singular "stage" when stages is 1', () => {
      const flowWithOneStage: Flow = {
        ...baseFlow,
        stages: 1,
      };

      render(<FlowRow flow={flowWithOneStage} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('stage')).toBeInTheDocument();
      expect(screen.queryByText('stages')).not.toBeInTheDocument();
    });

    it('should display plural "stages" when stages is 0', () => {
      const flowWithZeroStages: Flow = {
        ...baseFlow,
        stages: 0,
      };

      render(<FlowRow flow={flowWithZeroStages} />);

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('stages')).toBeInTheDocument();
    });

    it('should display plural "stages" when stages is 2', () => {
      const flowWithTwoStages: Flow = {
        ...baseFlow,
        stages: 2,
      };

      render(<FlowRow flow={flowWithTwoStages} />);

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('stages')).toBeInTheDocument();
    });

    it('should display plural "stages" when stages is 10', () => {
      const flowWithManyStages: Flow = {
        ...baseFlow,
        stages: 10,
      };

      render(<FlowRow flow={flowWithManyStages} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('stages')).toBeInTheDocument();
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
    it('should render complete composer flow with all properties', () => {
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
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('stages')).toBeInTheDocument();
      expect(screen.getByTestId('sparkle-icon')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute(
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
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute(
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
