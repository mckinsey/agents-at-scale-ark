import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HomepageWorkflowTemplatesCard } from '@/components/cards/homepage-workflow-templates-card';
import { APIError } from '@/lib/api/client';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('namespace=test-ns'),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/lib/services/workflow-templates-hooks', () => ({
  useGetAllWorkflowTemplates: vi.fn(),
}));

type WorkflowTemplatesQuery = ReturnType<typeof useGetAllWorkflowTemplates>;

function mockQuery(state: {
  data?: unknown[];
  isPending?: boolean;
  error?: unknown;
}) {
  vi.mocked(useGetAllWorkflowTemplates).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    error: state.error ?? null,
  } as unknown as WorkflowTemplatesQuery);
}

describe('HomepageWorkflowTemplatesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the workflow template count and links to the list', () => {
    mockQuery({ data: [{}, {}, {}] });

    render(<HomepageWorkflowTemplatesCard />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/workflow-templates?namespace=test-ns',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('renders nothing and shows no error when Argo Workflows is not installed', () => {
    mockQuery({
      error: new APIError(
        "Resource type 'workflowtemplates' is not available in the cluster (CRD not installed)",
        404,
      ),
    });

    const { container } = render(<HomepageWorkflowTemplatesCard />);

    expect(container).toBeEmptyDOMElement();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error toast for other failures', () => {
    mockQuery({ error: new APIError('Internal server error', 500) });

    render(<HomepageWorkflowTemplatesCard />);

    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to get Workflow Templates',
      expect.objectContaining({ description: 'Internal server error' }),
    );
  });
});
