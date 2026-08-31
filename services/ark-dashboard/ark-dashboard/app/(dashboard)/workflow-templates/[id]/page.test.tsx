import { render, screen, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

import WorkflowTemplatePage from './page';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    canCreate: vi.fn(),
    canUpdate: vi.fn(),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useParams: vi.fn(() => ({ id: 'my-flow' })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/components/workflow-studio/workflow-studio', () => ({
  WorkflowStudio: () => <div data-testid="workflow-studio" />,
}));

const mockCanCreate = vi.mocked(workflowTemplatesService.canCreate);
const mockCanUpdate = vi.mocked(workflowTemplatesService.canUpdate);

function setup(overrides?: { canUpdate?: boolean; namespace?: string }) {
  vi.mocked(useParams).mockReturnValue({ id: 'my-flow' });

  vi.mocked(useNamespace).mockReturnValue({
    namespace: overrides?.namespace ?? 'default',
    readOnlyMode: false,
  } as unknown as ReturnType<typeof useNamespace>);

  mockCanCreate.mockResolvedValue(false);
  mockCanUpdate.mockResolvedValue(overrides?.canUpdate ?? false);
}

describe('WorkflowTemplatePage guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the studio in edit mode when canUpdate is true', async () => {
    setup({ canUpdate: true });

    render(<WorkflowTemplatePage />);

    expect(await screen.findByTestId('workflow-studio')).toBeInTheDocument();
  });

  it('renders a not-authorized message with a back link and no studio when canUpdate is false', async () => {
    setup({ canUpdate: false });

    render(<WorkflowTemplatePage />);

    expect(
      await screen.findByText(/don't have permission to edit/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to workflow templates/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-studio')).not.toBeInTheDocument();
  });

  it('re-runs the access check when the namespace changes', async () => {
    setup({ canUpdate: true, namespace: 'ns-a' });

    const { rerender } = render(<WorkflowTemplatePage />);
    await waitFor(() => expect(mockCanUpdate).toHaveBeenCalledTimes(1));

    vi.mocked(useNamespace).mockReturnValue({
      namespace: 'ns-b',
      readOnlyMode: false,
    } as unknown as ReturnType<typeof useNamespace>);

    rerender(<WorkflowTemplatePage />);
    await waitFor(() => expect(mockCanUpdate).toHaveBeenCalledTimes(2));
  });
});
