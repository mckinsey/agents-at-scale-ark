import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NameWorkflowDialog } from '@/components/dialogs/name-workflow-dialog';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    list: vi.fn(),
  },
}));

const listMock = vi.mocked(workflowTemplatesService.list);

function makeTemplate(name: string) {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'WorkflowTemplate',
    metadata: { name },
  };
}

describe('NameWorkflowDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([makeTemplate('existing-template')]);
  });

  it('fetches existing names once when opened', async () => {
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
  });

  it('renders name, title and description fields', async () => {
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.getByTestId('workflow-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-title-input')).toBeInTheDocument();
    expect(
      screen.getByTestId('workflow-description-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/won't be able to rename it after creation/i),
    ).toBeInTheDocument();
  });

  it('disables submit when the name is empty', async () => {
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: 'Create workflow template' }),
    ).toBeDisabled();
  });

  it('disables submit and shows an error for an invalid name', async () => {
    const user = userEvent.setup();
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    await user.type(screen.getByTestId('workflow-name-input'), 'Invalid Name');

    expect(screen.getByTestId('workflow-name-error')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create workflow template' }),
    ).toBeDisabled();
  });

  it('disables submit for a duplicate name', async () => {
    const user = userEvent.setup();
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByTestId('workflow-name-input'),
      'existing-template',
    );

    await waitFor(() =>
      expect(screen.getByTestId('workflow-name-error')).toHaveTextContent(
        'already exists',
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Create workflow template' }),
    ).toBeDisabled();
  });

  it('enables submit and confirms all values for a valid unused name', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByTestId('workflow-name-input'), 'new-template');
    await user.type(screen.getByTestId('workflow-title-input'), 'New Template');
    await user.type(
      screen.getByTestId('workflow-description-input'),
      'A description',
    );

    const submit = screen.getByRole('button', {
      name: 'Create workflow template',
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(onConfirm).toHaveBeenCalledWith({
      name: 'new-template',
      title: 'New Template',
      description: 'A description',
    });
  });

  it('omits empty optional fields on confirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <NameWorkflowDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByTestId('workflow-name-input'), 'new-template');
    await user.click(
      screen.getByRole('button', { name: 'Create workflow template' }),
    );

    expect(onConfirm).toHaveBeenCalledWith({
      name: 'new-template',
      title: undefined,
      description: undefined,
    });
  });
});
