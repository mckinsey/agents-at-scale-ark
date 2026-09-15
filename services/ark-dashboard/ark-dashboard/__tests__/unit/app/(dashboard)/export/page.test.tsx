import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ExportPage from '@/app/(dashboard)/export/page';
import { exportService } from '@/lib/services/export';

// Mock dependencies
vi.mock('@/lib/services/export');
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default' }),
}));

const mockResources = {
  agents: [
    {
      id: 'agent-1',
      name: 'Agent 1',
      type: 'agent',
      description: 'First agent',
      selected: false,
    },
    { id: 'agent-2', name: 'Agent 2', type: 'agent', selected: false },
  ],
  teams: [{ id: 'team-1', name: 'Team Alpha', type: 'team', selected: false }],
  models: [{ id: 'model-1', name: 'GPT-4', type: 'model', selected: false }],
  queries: [],
  a2a: [],
  mcpservers: [],
  workflows: [],
};

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportService.getLastExportTime).mockResolvedValue(
      '2024-01-15T12:00:00Z',
    );
    vi.mocked(exportService.fetchAllResources).mockResolvedValue(mockResources);
  });

  it('should render and load resources', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Exports')).toBeInTheDocument();
      expect(exportService.fetchAllResources).toHaveBeenCalled();
    });

    // Resource filters are rendered as tag toggles with per-type counts
    expect(screen.getByRole('button', { name: 'All (4)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Agents (2)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Teams (1)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Models (1)' }),
    ).toBeInTheDocument();
  });

  it('should show every resource type on the All tab', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('GPT-4')).toBeInTheDocument();
    expect(screen.getByText('First agent')).toBeInTheDocument();
    expect(screen.getAllByText('Agent')).toHaveLength(2);
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
  });

  it('should filter rows to the selected resource type', async () => {
    const user = userEvent.setup();

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Agents (2)' }));

    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.queryByText('Team Alpha')).not.toBeInTheDocument();
  });

  it('should name the active resource type in the empty state', async () => {
    const user = userEvent.setup();

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Queries (0)' }));

    expect(
      screen.getByText('There are no Queries to export.'),
    ).toBeInTheDocument();
  });

  it('should allow selecting and exporting resources', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.exportResources).mockResolvedValue(undefined);

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    // Select first agent
    const agentRow = screen.getByText('Agent 1').closest('tr');
    const checkbox = within(agentRow!).getByRole('checkbox');
    await user.click(checkbox);

    expect(
      screen.getByRole('button', { name: /Export selected \(\s*1\s*\)/ }),
    ).toBeInTheDocument();

    // Export selected
    const exportButton = screen.getByRole('button', {
      name: /Export selected/,
    });
    await user.click(exportButton);

    await waitFor(() => {
      expect(exportService.exportResources).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          agents: expect.arrayContaining([
            expect.objectContaining({ id: 'agent-1', selected: true }),
          ]),
        }),
      );
    });
  });

  it('should select every visible row from the header checkbox', async () => {
    const user = userEvent.setup();

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all resources' }),
    );

    expect(
      screen.getByRole('button', { name: /Export selected \(\s*4\s*\)/ }),
    ).toBeInTheDocument();
  });

  it('should handle export all functionality', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.exportAll).mockResolvedValue(undefined);

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    const exportAllButton = screen.getByRole('button', {
      name: /Export all/,
    });
    await user.click(exportAllButton);

    await waitFor(() => {
      expect(exportService.exportAll).toHaveBeenCalled();
    });
  });

  it('should disable Export selected button when no resources are selected', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', {
      name: /Export selected \(\s*0\s*\)/,
    });
    expect(exportButton).toBeDisabled();
  });

  it('should display last export time', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText(/Last export:/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
    });
  });
});
