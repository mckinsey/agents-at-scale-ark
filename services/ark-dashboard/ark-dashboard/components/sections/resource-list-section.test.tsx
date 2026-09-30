import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
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

type SectionProps = ComponentProps<typeof ResourceListSection<Item>>;

function makeProps(overrides: Partial<SectionProps>): SectionProps {
  return {
    icon: <span>icon</span>,
    title: 'Agents',
    subtitle: 'Manage agents',
    createHref: '/agents/new',
    createLabel: 'Create agent',
    learnMoreUrl: 'https://example.com',
    entityLabel: 'Agent',
    emptyTitle: 'No Agents Yet',
    emptyDescription: 'Create your first agent',
    items: [],
    loading: false,
    error: undefined,
    dataUpdatedAt: 0,
    onDelete: vi.fn(),
    onReload: vi.fn(),
    renderTable: items => (
      <ul>
        {items.map(i => (
          <li key={i.id}>{i.name}</li>
        ))}
      </ul>
    ),
    ...overrides,
  };
}

function renderSection(overrides: Partial<SectionProps> = {}) {
  const props = makeProps(overrides);
  const result = render(<ResourceListSection<Item> {...props} />);
  return { ...result, props };
}

describe('ResourceListSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the error state (not the empty state) when the first load fails', () => {
    // dataUpdatedAt stays 0 until the first successful load, so an error here
    // is a load failure that replaces the list.
    renderSection({
      error: new Error('backend is down'),
      dataUpdatedAt: 0,
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load agents/i);
    expect(alert).toHaveTextContent(/backend is down/i);
    expect(screen.queryByText('No Agents Yet')).not.toBeInTheDocument();
  });

  it('calls onReload when the retry button is clicked', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    renderSection({ error: new Error('backend is down'), onReload });

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the load succeeds with no items', () => {
    renderSection({ items: [], dataUpdatedAt: 1_000 });

    expect(screen.getByText('No Agents Yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps stale data and shows a refresh banner when a refresh fails', () => {
    // A prior successful load (dataUpdatedAt > 0) plus an error is a refresh
    // failure: keep the last items and surface a banner rather than the list.
    renderSection({
      items: [{ id: '1', name: 'agent-one' }],
      error: new Error('refresh blew up'),
      dataUpdatedAt: 1_000,
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn't refresh agents/i);
    expect(screen.getByText('agent-one')).toBeInTheDocument();
  });
});
