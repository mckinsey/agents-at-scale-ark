import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsSection } from '@/components/sections/agents-section';
import type { Agent } from '@/lib/services';

const mockGetAll = vi.fn();
const mockDeleteById = vi.fn();
const mockReadOnly = { value: false };

vi.mock('@/lib/services', () => ({
  agentsService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    deleteById: (...args: unknown[]) => mockDeleteById(...args),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    readOnlyMode: mockReadOnly.value,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}));

vi.mock('@/components/sections/agents-table', () => ({
  AgentsTable: ({ agents }: { agents: Agent[] }) => (
    <div data-testid="agents-table">
      {agents.map(a => (
        <div key={a.id}>{a.name}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const sampleAgents: Agent[] = [
  { id: '1', name: 'alpha', description: 'first', available: 'True' } as Agent,
  { id: '2', name: 'beta', description: 'second', available: 'False' } as Agent,
];

describe('AgentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
  });

  it('shows Loading... while data is pending', () => {
    mockGetAll.mockReturnValue(new Promise(() => {}));
    render(<AgentsSection />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty state when there are no agents', async () => {
    mockGetAll.mockResolvedValue([]);
    render(<AgentsSection />);
    expect(await screen.findByText('No agents yet')).toBeInTheDocument();
    const learnMore = screen.getByRole('link', { name: /learn more/i });
    expect(learnMore).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-ark/user-guide/agents/',
    );
  });

  it('renders AgentsTable with returned agents', async () => {
    mockGetAll.mockResolvedValue(sampleAgents);
    render(<AgentsSection />);
    expect(await screen.findByTestId('agents-table')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('filters by search term (case-insensitive)', async () => {
    mockGetAll.mockResolvedValue(sampleAgents);
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    await userEvent.type(screen.getByPlaceholderText('Search'), 'ALP');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('disables Create Agent button in readOnly mode', async () => {
    mockReadOnly.value = true;
    mockGetAll.mockResolvedValue(sampleAgents);
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    expect(screen.getByRole('button', { name: 'Create Agent' })).toBeDisabled();
  });

  it('renders Create Agent link when not readOnly', async () => {
    mockGetAll.mockResolvedValue(sampleAgents);
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    const link = screen.getByRole('link', { name: /create agent/i });
    expect(link).toHaveAttribute('href', '/agents/new');
  });

  it('shows error toast when getAll fails', async () => {
    const { toast } = await import('sonner');
    mockGetAll.mockRejectedValue(new Error('boom'));
    render(<AgentsSection />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
