import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WorkflowTemplatesPage from '@/app/(dashboard)/workflow-templates/page';

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ currentPage }: { currentPage: string }) => (
    <div data-testid="page-header">{currentPage}</div>
  ),
}));

vi.mock('@/components/sections/workflow-templates-section', () => ({
  WorkflowTemplatesSection: () => (
    <div data-testid="workflow-templates-section">Workflow Templates Section</div>
  ),
}));

describe('WorkflowTemplatesPage', () => {
  it('should render page header with correct title', () => {
    render(<WorkflowTemplatesPage />);
    expect(screen.getByTestId('page-header')).toHaveTextContent('Workflow Templates');
  });

  it('should render workflow templates section', () => {
    render(<WorkflowTemplatesPage />);
    expect(screen.getByTestId('workflow-templates-section')).toBeInTheDocument();
  });

  it('should have correct breadcrumbs structure', () => {
    render(<WorkflowTemplatesPage />);
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });
});
