import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import ExportPage from '@/app/(dashboard)/export/page';
import { exportService } from '@/lib/services/export';

// Mock dependencies
vi.mock('@/lib/services/export');
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock the PageHeader component to avoid sidebar issues
vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => null,
}));

const mockResources = {
  agents: [
    { id: 'agent-1', name: 'Agent 1', type: 'agent', selected: false },
    { id: 'agent-2', name: 'Agent 2', type: 'agent', selected: false },
  ],
  teams: [
    { id: 'team-1', name: 'Team Alpha', type: 'team', selected: false },
  ],
  models: [
    { id: 'model-1', name: 'GPT-4', type: 'model', selected: false },
  ],
  queries: [],
  a2a: [],
  mcp: [],
  workflows: [],
  evaluators: [],
  evaluations: [],
};

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportService.getLastExportTime).mockResolvedValue('2024-01-15T12:00:00Z');
    vi.mocked(exportService.fetchAllResources).mockResolvedValue(mockResources);
  });

  it('should render and load resources', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Exports')).toBeInTheDocument();
      expect(exportService.fetchAllResources).toHaveBeenCalled();
    });

    // Check that tabs are rendered
    expect(screen.getByRole('tab', { name: /Agents/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Teams/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Models/ })).toBeInTheDocument();
  });

  it('should allow selecting and exporting resources', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.exportResources).mockResolvedValue(undefined);

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    // Select first agent
    const agentRow = screen.getByText('Agent 1').closest('div');
    const checkbox = within(agentRow!).getByRole('checkbox');
    await user.click(checkbox);

    expect(screen.getByText(/Export Selected \(1\)/)).toBeInTheDocument();

    // Export selected
    const exportButton = screen.getByRole('button', { name: /Export Selected/ });
    await user.click(exportButton);

    await waitFor(() => {
      expect(exportService.exportResources).toHaveBeenCalledWith(
        expect.objectContaining({
          agents: expect.arrayContaining([
            expect.objectContaining({ id: 'agent-1', selected: true }),
          ]),
        })
      );
    });
  });

  it('should handle export all functionality', async () => {
    const user = userEvent.setup();
    vi.mocked(exportService.exportAll).mockResolvedValue(undefined);

    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    const exportAllButton = screen.getByRole('button', { name: /Export All/ });
    await user.click(exportAllButton);

    await waitFor(() => {
      expect(exportService.exportAll).toHaveBeenCalled();
    });
  });

  it('should disable Export Selected button when no resources are selected', async () => {
    render(<ExportPage />);

    await waitFor(() => {
      expect(screen.getByText('Agent 1')).toBeInTheDocument();
    });

    // Export Selected should be disabled when nothing is selected
    const exportButton = screen.getByRole('button', { name: /Export Selected \(0\)/ });
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