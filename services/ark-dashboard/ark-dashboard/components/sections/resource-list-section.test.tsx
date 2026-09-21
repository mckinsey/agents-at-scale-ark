import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResourceListItem } from './resource-list-section';
import { ResourceListSection } from './resource-list-section';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

interface Item extends ResourceListItem {
  id: string;
  name: string;
}

function renderSection(loadItems: () => Promise<Item[]>) {
  return render(
    <ResourceListSection<Item>
      icon={<span>icon</span>}
      title="Agents"
      subtitle="Manage agents"
      createHref="/agents/new"
      createLabel="Create agent"
      learnMoreUrl="https://example.com"
      entityLabel="Agent"
      emptyTitle="No Agents Yet"
      emptyDescription="Create your first agent"
      loadItems={loadItems}
      deleteItem={vi.fn().mockResolvedValue(undefined)}
      renderTable={(items, _onDelete, reload) => (
        <div>
          <button type="button" onClick={reload}>
            trigger-reload
          </button>
          <ul>
            {items.map(i => (
              <li key={i.id}>{i.name}</li>
            ))}
          </ul>
        </div>
      )}
    />,
  );
}

describe('ResourceListSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the error state (not the empty state) when the load fails', async () => {
    renderSection(() => Promise.reject(new Error('backend is down')));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load agents/i);
    expect(alert).toHaveTextContent(/backend is down/i);
    expect(screen.queryByText('No Agents Yet')).not.toBeInTheDocument();
  });

  it('retries the load when the retry button is clicked', async () => {
    const loadItems = vi
      .fn<() => Promise<Item[]>>()
      .mockRejectedValueOnce(new Error('backend is down'))
      .mockResolvedValueOnce([{ id: '1', name: 'agent-one' }]);

    const user = userEvent.setup();
    renderSection(loadItems);

    await user.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByText('agent-one')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the empty state when the load succeeds with no items', async () => {
    renderSection(() => Promise.resolve([]));

    expect(await screen.findByText('No Agents Yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps stale data and shows a refresh banner when a refresh fails', async () => {
    const loadItems = vi
      .fn<() => Promise<Item[]>>()
      .mockResolvedValueOnce([{ id: '1', name: 'agent-one' }])
      .mockRejectedValueOnce(new Error('refresh blew up'));

    const user = userEvent.setup();
    renderSection(loadItems);

    expect(await screen.findByText('agent-one')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'trigger-reload' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't refresh agents/i);
    expect(screen.getByText('agent-one')).toBeInTheDocument();
  });
});
