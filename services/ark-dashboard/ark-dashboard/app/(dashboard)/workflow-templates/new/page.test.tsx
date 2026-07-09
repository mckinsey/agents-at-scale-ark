import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

import NewWorkflowTemplatePage from './page';

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
  useSearchParams: vi.fn(() => new URLSearchParams('name=my-flow')),
}));

vi.mock('@/components/workflow-studio/workflow-studio', () => ({
  WorkflowStudio: () => <div data-testid="workflow-studio" />,
}));

const mockCanCreate = vi.mocked(workflowTemplatesService.canCreate);
const mockCanUpdate = vi.mocked(workflowTemplatesService.canUpdate);

function setup(overrides?: { canCreate?: boolean; namespace?: string }) {
  vi.mocked(useNamespace).mockReturnValue({
    namespace: overrides?.namespace ?? 'default',
    readOnlyMode: false,
  } as unknown as ReturnType<typeof useNamespace>);

  mockCanCreate.mockResolvedValue(overrides?.canCreate ?? false);
  mockCanUpdate.mockResolvedValue(false);
}

describe('NewWorkflowTemplatePage guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the studio when canCreate is true', async () => {
    setup({ canCreate: true });

    render(<NewWorkflowTemplatePage />);

    expect(await screen.findByTestId('workflow-studio')).toBeInTheDocument();
  });

  it('renders a not-authorized message and no studio when canCreate is false', async () => {
    setup({ canCreate: false });

    render(<NewWorkflowTemplatePage />);

    expect(
      await screen.findByText(/don't have permission to create/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-studio')).not.toBeInTheDocument();
  });

  it('re-runs the access check when the namespace changes', async () => {
    setup({ canCreate: true, namespace: 'ns-a' });

    const { rerender } = render(<NewWorkflowTemplatePage />);
    await waitFor(() => expect(mockCanCreate).toHaveBeenCalledTimes(1));

    vi.mocked(useNamespace).mockReturnValue({
      namespace: 'ns-b',
      readOnlyMode: false,
    } as unknown as ReturnType<typeof useNamespace>);

    rerender(<NewWorkflowTemplatePage />);
    await waitFor(() => expect(mockCanCreate).toHaveBeenCalledTimes(2));
  });
});
