import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsService, toolsService } from '@/lib/services';

import { ToolsSection } from './tools-section';

let currentNamespace = 'default';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: currentNamespace,
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

vi.mock('@/components/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/services', () => ({
  toolsService: { getAll: vi.fn(), delete: vi.fn() },
  agentsService: { getAll: vi.fn() },
}));

const mockToolsService = vi.mocked(toolsService);
const mockAgentsService = vi.mocked(agentsService);

describe('ToolsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentNamespace = 'default';
    mockAgentsService.getAll.mockResolvedValue([]);
  });

  it('renders the error state instead of the empty state when the load fails', async () => {
    mockToolsService.getAll.mockRejectedValue(new Error('backend is down'));

    render(<ToolsSection />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load tools/i);
    expect(alert).toHaveTextContent(/backend is down/i);
    expect(screen.queryByText(/no tools yet/i)).not.toBeInTheDocument();
  });

  it('retries the load when the retry button is clicked', async () => {
    mockToolsService.getAll
      .mockRejectedValueOnce(new Error('backend is down'))
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(<ToolsSection />);

    await user.click(await screen.findByRole('button', { name: /retry/i }));

    await waitFor(() =>
      expect(mockToolsService.getAll).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the empty state when the load succeeds with no tools', async () => {
    mockToolsService.getAll.mockResolvedValue([]);

    render(<ToolsSection />);

    expect(await screen.findByText(/no tools yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the list (loadFailed) when a load fails right after a namespace switch', async () => {
    // First namespace loads with zero tools (empty state, no table to render),
    // then a switch whose fetch fails must show loadFailed, not refreshFailed.
    mockToolsService.getAll
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('forbidden in bar'));

    const { rerender } = render(<ToolsSection />);

    expect(await screen.findByText(/no tools yet/i)).toBeInTheDocument();

    currentNamespace = 'bar';
    rerender(<ToolsSection />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load tools/i);
    expect(
      screen.queryByText(/showing the last loaded version/i),
    ).not.toBeInTheDocument();
  });
});
