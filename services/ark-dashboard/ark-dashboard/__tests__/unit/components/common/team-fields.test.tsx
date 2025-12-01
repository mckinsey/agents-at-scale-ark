import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamFields } from '@/components/common/team-fields';
import { teamsService } from '@/lib/services';

vi.mock('@/lib/services', () => ({
  teamsService: {
    getAll: vi.fn(),
  },
}));

describe('TeamFields', () => {
  const defaultProps = {
    selectedTeam: '',
    setSelectedTeam: vi.fn(),
    namespace: 'default',
    open: true,
  };

  const mockTeams = [
    {
      id: '1',
      name: 'math-team',
      namespace: 'default',
      description: 'Math team',
      members: [{ name: 'agent1', type: 'agent' }],
      strategy: 'sequential',
    },
    {
      id: '2',
      name: 'research-team',
      namespace: 'default',
      description: 'Research team',
      members: [{ name: 'agent2', type: 'agent' }],
      strategy: 'sequential',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render team select field', () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce(mockTeams);

    render(<TeamFields {...defaultProps} />);

    expect(screen.getByLabelText('Team')).toBeInTheDocument();
  });

  it('should show loading state when fetching teams', async () => {
    vi.mocked(teamsService.getAll).mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve(mockTeams), 100);
        }),
    );

    render(<TeamFields {...defaultProps} />);

    expect(screen.getByText('Loading teams...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading teams...')).not.toBeInTheDocument();
    });
  });

  it('should fetch teams when dialog opens', async () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce(mockTeams);

    render(<TeamFields {...defaultProps} open={true} />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading teams...')).not.toBeInTheDocument();
    });

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toBeInTheDocument();
  });

  it('should not fetch teams when dialog is closed', () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce(mockTeams);

    render(<TeamFields {...defaultProps} open={false} />);

    expect(teamsService.getAll).not.toHaveBeenCalled();
  });

  it('should handle empty teams list', async () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce([]);

    render(<TeamFields {...defaultProps} />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading teams...')).not.toBeInTheDocument();
    });

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toBeInTheDocument();
  });

  it('should accept selectedTeam prop', async () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce(mockTeams);

    render(<TeamFields {...defaultProps} selectedTeam="math-team" />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalled();
    });

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toBeInTheDocument();
  });

  it('should display selected team', async () => {
    vi.mocked(teamsService.getAll).mockResolvedValueOnce(mockTeams);

    render(<TeamFields {...defaultProps} selectedTeam="math-team" />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalled();
    });

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toBeInTheDocument();
  });

  it('should handle fetch error gracefully', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(teamsService.getAll).mockRejectedValueOnce(
      new Error('Failed to fetch'),
    );

    render(<TeamFields {...defaultProps} />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading teams...')).not.toBeInTheDocument();
    });

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('should refetch teams when namespace changes', async () => {
    vi.mocked(teamsService.getAll).mockResolvedValue(mockTeams);

    const { rerender } = render(
      <TeamFields {...defaultProps} namespace="default" />,
    );

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalledTimes(1);
    });

    rerender(<TeamFields {...defaultProps} namespace="other-namespace" />);

    await waitFor(() => {
      expect(teamsService.getAll).toHaveBeenCalledTimes(2);
    });
  });
});
