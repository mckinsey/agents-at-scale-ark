import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowTemplatesNotInstalled } from '@/components/sections/workflow-templates-not-installed';
import { ARGO_WORKFLOWS_DOCS_URL } from '@/lib/constants/workflows';

vi.mock('@/lib/constants', () => ({
  DASHBOARD_SECTIONS: {
    'workflow-templates': {
      icon: () => <div>WorkflowIcon</div>,
    },
  },
}));

describe('WorkflowTemplatesNotInstalled', () => {
  it('renders the not-installed message', () => {
    render(<WorkflowTemplatesNotInstalled />);

    expect(
      screen.getByText(/Argo Workflows isn't installed/i),
    ).toBeInTheDocument();
  });

  it('links to the workflows documentation', () => {
    render(<WorkflowTemplatesNotInstalled />);

    const link = screen.getByRole('link', {
      name: /Learn how to install Argo Workflows/i,
    });
    expect(link).toHaveAttribute('href', ARGO_WORKFLOWS_DOCS_URL);
  });
});
