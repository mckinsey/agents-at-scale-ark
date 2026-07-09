import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

import WorkflowTemplatesPage from './page';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    canCreate: vi.fn(),
    canUpdate: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock('@/lib/services/workflow-templates-hooks', () => ({
  useGetAllWorkflowTemplates: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(),
}));

vi.mock('@/components/sections/workflow-templates-section', () => ({
  WorkflowTemplatesSection: () => <div data-testid="section" />,
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header">{actions}</div>
  ),
}));

const mockPush = vi.fn();
const mockCanCreate = vi.mocked(workflowTemplatesService.canCreate);
const mockCanUpdate = vi.mocked(workflowTemplatesService.canUpdate);

function setup(overrides?: {
  readOnlyMode?: boolean;
  namespace?: string;
  canCreate?: boolean | Promise<boolean>;
}) {
  vi.mocked(useGetAllWorkflowTemplates).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useGetAllWorkflowTemplates>);

  vi.mocked(useNamespace).mockReturnValue({
    namespace: overrides?.namespace ?? 'default',
    readOnlyMode: overrides?.readOnlyMode ?? false,
  } as unknown as ReturnType<typeof useNamespace>);

  vi.mocked(useNamespacedNavigation).mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
  });

  const createValue = overrides?.canCreate ?? true;
  if (createValue instanceof Promise) {
    mockCanCreate.mockReturnValue(createValue);
  } else {
    mockCanCreate.mockResolvedValue(createValue);
  }
  mockCanUpdate.mockResolvedValue(false);
}

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Create workflow CTA when canCreate is true', async () => {
    setup({ canCreate: true });

    render(<WorkflowTemplatesPage />);

    expect(
      await screen.findByRole('button', { name: /create workflow/i }),
    ).toBeInTheDocument();
  });

  it('opens the name dialog and navigates with the encoded name on confirm', async () => {
    setup({ canCreate: true });
    const user = userEvent.setup();

    render(<WorkflowTemplatesPage />);

    const cta = await screen.findByRole('button', {
      name: /create workflow/i,
    });
    await user.click(cta);

    const input = await screen.findByLabelText('Workflow name');
    await user.type(input, 'my flow');

    const confirm = screen.getByRole('button', { name: 'Create workflow' });
    await user.click(confirm);

    expect(mockPush).toHaveBeenCalledWith(
      '/workflow-templates/new?name=my%20flow',
    );
  });

  it('hides the CTA when canCreate resolves false (fail closed)', async () => {
    setup({ canCreate: false });

    render(<WorkflowTemplatesPage />);

    await waitFor(() => expect(mockCanCreate).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /create workflow/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the CTA when canCreate rejects (fail closed)', async () => {
    setup({ canCreate: Promise.reject(new Error('boom')) });

    render(<WorkflowTemplatesPage />);

    await waitFor(() => expect(mockCanCreate).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /create workflow/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the CTA in read-only mode even when canCreate is true', async () => {
    setup({ canCreate: true, readOnlyMode: true });

    render(<WorkflowTemplatesPage />);

    await waitFor(() => expect(mockCanCreate).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /create workflow/i }),
    ).not.toBeInTheDocument();
  });

  it('re-runs the access check when the namespace changes', async () => {
    setup({ canCreate: true, namespace: 'ns-a' });

    const { rerender } = render(<WorkflowTemplatesPage />);
    await waitFor(() => expect(mockCanCreate).toHaveBeenCalledTimes(1));

    vi.mocked(useNamespace).mockReturnValue({
      namespace: 'ns-b',
      readOnlyMode: false,
    } as unknown as ReturnType<typeof useNamespace>);

    rerender(<WorkflowTemplatesPage />);
    await waitFor(() => expect(mockCanCreate).toHaveBeenCalledTimes(2));
  });
});
