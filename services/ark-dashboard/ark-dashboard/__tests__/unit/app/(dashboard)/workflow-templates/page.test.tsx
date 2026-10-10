import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WorkflowTemplatesPage from '@/app/(dashboard)/workflow-templates/page';

vi.mock('@/components/sections/workflow-templates-section', () => ({
  WorkflowTemplatesSection: () => (
    <div data-testid="workflow-templates-section">
      Workflow Templates Section
    </div>
  ),
}));

describe('WorkflowTemplatesPage', () => {
  it('renders the workflow templates section', () => {
    render(<WorkflowTemplatesPage />);
    expect(
      screen.getByTestId('workflow-templates-section'),
    ).toBeInTheDocument();
  });
});
