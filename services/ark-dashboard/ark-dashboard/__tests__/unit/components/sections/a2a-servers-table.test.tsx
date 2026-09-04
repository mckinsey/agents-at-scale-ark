import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { A2AServersTable } from '@/components/sections/a2a-servers-table';
import type { A2AServer } from '@/lib/services/a2a-servers';

let readOnly = false;
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/a2a'),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: readOnly, namespace: 'default' }),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
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

const servers: A2AServer[] = [
  {
    id: 'simple-agent',
    name: 'simple-agent',
    namespace: 'default',
    description: 'Simple agent with conversation, math, and echo capabilities',
    address: 'http://simple-agent.default.svc.cluster.local:80',
    ready: true,
  },
  {
    id: 'a2a-task-demos',
    name: 'a2a-task-demos',
    namespace: 'default',
    address: 'http://a2a-task-demos.default.svc.cluster.local:80',
    ready: false,
    status_message: 'A2A server is being initialized',
  },
];

describe('A2AServersTable', () => {
  beforeEach(() => {
    readOnly = false;
    vi.clearAllMocks();
  });

  it('renders every column header', () => {
    render(<A2AServersTable servers={servers} onDelete={vi.fn()} />);

    for (const header of [
      'Name',
      'Description',
      'Address',
      'Status message',
      'Status',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
  });

  it('renders a row per server with its details', () => {
    render(<A2AServersTable servers={servers} onDelete={vi.fn()} />);

    expect(screen.getByText('simple-agent')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Simple agent with conversation, math, and echo capabilities',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('http://simple-agent.default.svc.cluster.local:80'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A2A server is being initialized'),
    ).toBeInTheDocument();
  });

  it('shows Available for a ready server and Unavailable otherwise', () => {
    render(<A2AServersTable servers={servers} onDelete={vi.fn()} />);

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Available' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Unavailable' }),
    ).toBeInTheDocument();
  });

  it('falls back to a dash for a missing description', () => {
    render(<A2AServersTable servers={[servers[1]]} onDelete={vi.fn()} />);

    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('links each row to the server detail page', () => {
    render(<A2AServersTable servers={servers} onDelete={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'simple-agent' })).toHaveAttribute(
      'href',
      '/a2a/simple-agent',
    );
    expect(
      screen.getByRole('link', { name: 'a2a-task-demos' }),
    ).toHaveAttribute('href', '/a2a/a2a-task-demos');
  });

  it('navigates to the events view scoped to the server', async () => {
    render(<A2AServersTable servers={[servers[0]]} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'See events' }));

    expect(push).toHaveBeenCalledWith(
      '/events?kind=A2AServer&name=simple-agent&page=1',
    );
  });

  it('deletes a server after confirmation', async () => {
    const onDelete = vi.fn();
    render(<A2AServersTable servers={[servers[0]]} onDelete={onDelete} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete A2A server' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('simple-agent');
  });

  it('disables delete in read-only mode', () => {
    readOnly = true;
    render(<A2AServersTable servers={[servers[0]]} onDelete={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Delete A2A server' }),
    ).toBeDisabled();
  });
});
