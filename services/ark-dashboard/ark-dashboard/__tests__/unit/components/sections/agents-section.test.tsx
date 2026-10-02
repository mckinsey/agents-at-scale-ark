import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsSection } from '@/components/sections/agents-section';
import { toast } from '@/components/ui/sonner';
import type { AgentListItem } from '@/lib/services';

const mockUseGetAllAgents = vi.fn();
const mockMutate = vi.fn();
const mockRefetch = vi.fn();
const mockReadOnly = { value: false };

vi.mock('@/lib/services/agents-hooks', () => ({
  useGetAllAgents: () => mockUseGetAllAgents(),
  useDeleteAgent: () => ({ mutate: mockMutate }),
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
  AgentsTable: ({ agents }: { agents: AgentListItem[] }) => (
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

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const sampleAgents: AgentListItem[] = [
  {
    id: '1',
    name: 'alpha',
    description: 'first',
    available: 'True',
  } as AgentListItem,
  {
    id: '2',
    name: 'beta',
    description: 'second',
    available: 'False',
  } as AgentListItem,
];

const mockQueryResult = (
  overrides: Partial<{
    data: AgentListItem[];
    isPending: boolean;
    error: unknown;
  }> = {},
) => ({
  data: overrides.data ?? [],
  isPending: overrides.isPending ?? false,
  error: overrides.error ?? null,
  refetch: mockRefetch,
});

describe('AgentsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadOnly.value = false;
    mockUseGetAllAgents.mockReturnValue(mockQueryResult());
  });

  it('shows Loading... while data is pending', () => {
    mockUseGetAllAgents.mockReturnValue(mockQueryResult({ isPending: true }));
    render(<AgentsSection />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the empty state when there are no agents', async () => {
    mockUseGetAllAgents.mockReturnValue(mockQueryResult({ data: [] }));
    render(<AgentsSection />);
    expect(await screen.findByText('No agents yet')).toBeInTheDocument();
    const learnMore = screen.getByRole('link', { name: /learn more/i });
    expect(learnMore).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-ark/user-guide/agents/',
    );
  });

  it('renders AgentsTable with returned agents', async () => {
    mockUseGetAllAgents.mockReturnValue(
      mockQueryResult({ data: sampleAgents }),
    );
    render(<AgentsSection />);
    expect(await screen.findByTestId('agents-table')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('filters by search term (case-insensitive)', async () => {
    mockUseGetAllAgents.mockReturnValue(
      mockQueryResult({ data: sampleAgents }),
    );
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    await userEvent.type(screen.getByPlaceholderText('Search'), 'ALP');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('disables Create Agent button in readOnly mode', async () => {
    mockReadOnly.value = true;
    mockUseGetAllAgents.mockReturnValue(
      mockQueryResult({ data: sampleAgents }),
    );
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeDisabled();
  });

  it('renders Create Agent link when not readOnly', async () => {
    mockUseGetAllAgents.mockReturnValue(
      mockQueryResult({ data: sampleAgents }),
    );
    render(<AgentsSection />);
    await screen.findByTestId('agents-table');
    const link = screen.getByRole('link', { name: /create agent/i });
    expect(link).toHaveAttribute('href', '/agents/new');
  });

  it('surfaces a load error via toast instead of a silent empty state', async () => {
    mockUseGetAllAgents.mockReturnValue(
      mockQueryResult({ data: [], error: new Error('boom') }),
    );
    render(<AgentsSection />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to Load agents', {
        description: 'boom',
      });
    });
  });
});
