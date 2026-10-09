import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type WorkflowTemplateListItem,
  WorkflowTemplatesTable,
} from '@/components/sections/workflow-templates-table';
import { ArgoUrlProvider } from '@/providers/argo-url-provider';

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

  it('links Open in Argo to the configured Argo UI', async () => {
    const user = userEvent.setup();
    render(
      <ArgoUrlProvider argoUrl="https://argo.example.com">
        <WorkflowTemplatesTable
          templates={templates}
          onDelete={vi.fn()}
          onRun={vi.fn()}
        />
      </ArgoUrlProvider>,
    );
    await user.click(screen.getByLabelText('Workflow template actions'));
    expect(
      screen.getByRole('menuitem', { name: 'Open in Argo' }),
    ).toHaveAttribute(
      'href',
      'https://argo.example.com/workflow-templates/default/data-pipeline',
    );
  });

  it('hides Open in Argo when no Argo URL is configured', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowTemplatesTable
        templates={templates}
        onDelete={vi.fn()}
        onRun={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Workflow template actions'));
    expect(
      screen.getByRole('menuitem', { name: 'Run workflow' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Open in Argo' }),
    ).not.toBeInTheDocument();
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
