import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type WorkflowTemplateListItem,
  WorkflowTemplatesTable,
} from '@/components/sections/workflow-templates-table';

let readOnly = false;

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: readOnly, namespace: 'default' }),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    onConfirm,
    confirmText,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmText: string;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

const templates: WorkflowTemplateListItem[] = [
  {
    id: 'data-pipeline',
    name: 'data-pipeline',
    title: 'Data Pipeline',
    description: 'Processes customer data',
    stages: 3,
  },
];

describe('WorkflowTemplatesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnly = false;
  });

  it('renders each template with its detail link', () => {
    render(
      <WorkflowTemplatesTable
        templates={templates}
        onDelete={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'data-pipeline' })).toHaveAttribute(
      'href',
      expect.stringContaining('/workflow-templates/data-pipeline'),
    );
    expect(screen.getByText('Data Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Processes customer data')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens the confirmation dialog and calls onDelete on confirm', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <WorkflowTemplatesTable
        templates={templates}
        onDelete={onDelete}
        onRun={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Workflow template actions'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('data-pipeline');
  });

  it('runs the template from the actions menu', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowTemplatesTable
        templates={templates}
        onDelete={vi.fn()}
        onRun={onRun}
      />,
    );
    await user.click(screen.getByLabelText('Workflow template actions'));
    await user.click(screen.getByRole('menuitem', { name: 'Run workflow' }));
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledWith('data-pipeline', undefined, undefined);
  });

  it('disables Delete in read-only mode', async () => {
    readOnly = true;
    const user = userEvent.setup();
    render(
      <WorkflowTemplatesTable
        templates={templates}
        onDelete={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Workflow template actions'));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'data-disabled',
    );
  });
});
