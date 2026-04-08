import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TeamFormMode } from '@/components/forms/team-form/types';

vi.mock('@/lib/services', () => ({
  teamsService: {
    getByName: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
  },
  agentsService: {
    getAll: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNamespace = 'default';
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: mockNamespace,
    isNamespaceResolved: true,
    availableNamespaces: [{ name: mockNamespace }],
    isPending: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
    readOnlyMode: false,
  })),
}));

import { useTeamForm } from '@/components/forms/team-form/use-team-form';
import { teamsService, agentsService } from '@/lib/services';
import { toast } from 'sonner';

const mockTeamsService = vi.mocked(teamsService);
const mockAgentsService = vi.mocked(agentsService);
const mockToast = vi.mocked(toast);

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentsService.getAll.mockResolvedValue([]);
});

describe('useTeamForm', () => {
  it('should default loops to false and strategy to sequential in CREATE mode', async () => {
    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.form.getValues('loops')).toBe(false);
    expect(result.current.form.getValues('strategy')).toBe('sequential');
  });

  it('should load team data with loops in EDIT mode', async () => {
    mockTeamsService.getByName.mockResolvedValue({
      name: 'test-team',
      description: 'A test team',
      strategy: 'sequential',
      loops: true,
      maxTurns: 5,
      members: [{ name: 'agent1', type: 'agent' }],
    } as any);
    mockAgentsService.getAll.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.EDIT, teamName: 'test-team' }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.form.getValues('loops')).toBe(true);
    expect(result.current.form.getValues('maxTurns')).toBe('5');
  });

  it('should include loops=false in CREATE submit', async () => {
    mockTeamsService.create.mockResolvedValue({} as any);

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      result.current.form.setValue('name', 'new-team');
      result.current.form.setValue('strategy', 'sequential');
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ loops: false }),
    );
  });

  it('should include loops=true with maxTurns in CREATE submit', async () => {
    mockTeamsService.create.mockResolvedValue({} as any);

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      result.current.form.setValue('name', 'loop-team');
      result.current.form.setValue('strategy', 'sequential');
      result.current.form.setValue('loops', true);
      result.current.form.setValue('maxTurns', '5');
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ loops: true, maxTurns: 5 }),
    );
  });

  it('should call updateById with loops in VIEW mode submit', async () => {
    const teamData = {
      id: 'team-123',
      name: 'edit-team',
      description: 'desc',
      strategy: 'sequential',
      loops: true,
      maxTurns: 3,
      members: [{ name: 'agent1', type: 'agent' }],
    };
    mockTeamsService.getByName.mockResolvedValue(teamData as any);
    mockTeamsService.updateById.mockResolvedValue({} as any);
    mockAgentsService.getAll.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.VIEW, teamName: 'edit-team' }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.updateById).toHaveBeenCalledWith(
      'team-123',
      expect.objectContaining({ loops: true }),
    );
  });

  it('should require maxTurns when strategy is sequential and loops is enabled', async () => {
    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    act(() => {
      result.current.form.setValue('name', 'valid-name');
      result.current.form.setValue('strategy', 'sequential');
      result.current.form.setValue('loops', true);
      result.current.form.setValue('maxTurns', '');
    });

    let maxTurnsError: string | undefined;
    await act(async () => {
      await new Promise<void>(resolve => {
        result.current.form.handleSubmit(
          () => resolve(),
          errors => {
            maxTurnsError = errors.maxTurns?.message;
            resolve();
          },
        )({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      });
    });

    expect(maxTurnsError).toBe('Max turns is required for looping sequential teams');
  });

  it('should require maxTurns when strategy is graph', async () => {
    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    act(() => {
      result.current.form.setValue('name', 'valid-name');
      result.current.form.setValue('strategy', 'graph');
      result.current.form.setValue('maxTurns', '');
    });

    let maxTurnsError: string | undefined;
    await act(async () => {
      await new Promise<void>(resolve => {
        result.current.form.handleSubmit(
          () => resolve(),
          errors => {
            maxTurnsError = errors.maxTurns?.message;
            resolve();
          },
        )({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      });
    });

    expect(maxTurnsError).toBe('Max turns is required for graph teams');
  });

  it('should not require maxTurns when strategy is sequential and loops is disabled', async () => {
    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    act(() => {
      result.current.form.setValue('name', 'valid-name');
      result.current.form.setValue('strategy', 'sequential');
      result.current.form.setValue('loops', false);
      result.current.form.setValue('maxTurns', '');
    });

    let maxTurnsError: string | undefined;
    await act(async () => {
      await new Promise<void>(resolve => {
        result.current.form.handleSubmit(
          () => resolve(),
          errors => {
            maxTurnsError = errors.maxTurns?.message;
            resolve();
          },
        )({ preventDefault: () => {}, stopPropagation: () => {} } as any);
      });
    });

    expect(maxTurnsError).toBeUndefined();
  });

  it('should detect hasChanges correctly', async () => {
    const teamData = {
      id: 'team-123',
      name: 'edit-team',
      strategy: 'sequential',
      loops: false,
      members: [{ name: 'agent1', type: 'agent' }],
    };
    mockTeamsService.getByName.mockResolvedValue(teamData as any);
    mockAgentsService.getAll.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.VIEW, teamName: 'edit-team' }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.hasChanges).toBe(false);

    act(() => {
      result.current.form.setValue('loops', true, { shouldDirty: true });
    });

    expect(result.current.state.hasChanges).toBe(true);
  });

  it('should show toast error when service throws', async () => {
    mockTeamsService.create.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useTeamForm({ mode: TeamFormMode.CREATE }),
    );

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      result.current.form.setValue('name', 'fail-team');
      result.current.form.setValue('strategy', 'sequential');
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to create team',
      expect.objectContaining({ description: 'Network error' }),
    );
  });
});
