import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamFormMode } from '@/components/forms/team-form/types';
import { useTeamForm } from '@/components/forms/team-form/use-team-form';
import { toast } from '@/components/ui/sonner';
import type { Team } from '@/lib/services';
import { agentsService, teamsService } from '@/lib/services';
import { GET_ALL_TEAMS_QUERY_KEY } from '@/lib/services/teams-hooks';

vi.mock('@/lib/services', () => ({
  teamsService: {
    getByName: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
  },
  agentsService: {
    listWithTools: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
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
    isPending: false,
    readOnlyMode: false,
  })),
}));

const mockTeamsService = vi.mocked(teamsService);
const mockAgentsService = vi.mocked(agentsService);
const mockToast = vi.mocked(toast);

const TEAMS_LIST_KEY = [GET_ALL_TEAMS_QUERY_KEY, mockNamespace];

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderUseTeamForm = (
  options: Parameters<typeof useTeamForm>[0],
  client: QueryClient = createQueryClient(),
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTeamForm(options), { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentsService.listWithTools.mockResolvedValue([]);
});

describe('useTeamForm', () => {
  it('should default loops to false and strategy to sequential in CREATE mode', async () => {
    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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
    mockAgentsService.listWithTools.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderUseTeamForm({
      mode: TeamFormMode.EDIT,
      teamName: 'test-team',
    });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.form.getValues('loops')).toBe(true);
    expect(result.current.form.getValues('maxTurns')).toBe('5');
  });

  it('should include loops=false in CREATE submit', async () => {
    mockTeamsService.create.mockResolvedValue({} as any);

    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      result.current.form.setValue('name', 'new-team');
      result.current.form.setValue('strategy', 'sequential');
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.create).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ loops: false }),
    );
  });

  it('should include loops=true with maxTurns in CREATE submit', async () => {
    mockTeamsService.create.mockResolvedValue({} as any);

    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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
      'default',
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
    mockAgentsService.listWithTools.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderUseTeamForm({
      mode: TeamFormMode.VIEW,
      teamName: 'edit-team',
    });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.updateById).toHaveBeenCalledWith(
      'default',
      'team-123',
      expect.objectContaining({ loops: true, maxTurns: 3 }),
    );
  });

  it('should send maxTurns=null when a selector team is saved as non-looping sequential', async () => {
    const selectorTeam: Team = {
      id: 'team-123',
      name: 'selector-team',
      namespace: mockNamespace,
      strategy: 'selector',
      loops: false,
      maxTurns: 5,
      members: [],
    };
    mockTeamsService.getByName.mockResolvedValue(selectorTeam);
    mockTeamsService.updateById.mockResolvedValue(selectorTeam);

    const { result } = renderUseTeamForm({
      mode: TeamFormMode.VIEW,
      teamName: 'selector-team',
    });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    act(() => {
      result.current.form.setValue('strategy', 'sequential');
      result.current.form.setValue('maxTurns', '');
    });

    await act(async () => {
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(mockTeamsService.updateById).toHaveBeenCalledWith(
      'default',
      'team-123',
      expect.objectContaining({
        strategy: 'sequential',
        loops: false,
        maxTurns: null,
      }),
    );
  });

  it('should require maxTurns when strategy is sequential and loops is enabled', async () => {
    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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

    expect(maxTurnsError).toBe(
      'Max turns is required for looping sequential teams',
    );
  });

  it('should require maxTurns when strategy is graph', async () => {
    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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
    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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
    mockAgentsService.listWithTools.mockResolvedValue([
      { name: 'agent1' },
    ] as any);

    const { result } = renderUseTeamForm({
      mode: TeamFormMode.VIEW,
      teamName: 'edit-team',
    });

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

    const { result } = renderUseTeamForm({ mode: TeamFormMode.CREATE });

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

  describe('teams list cache', () => {
    const existingTeam: Team = {
      id: 'existing',
      name: 'existing',
      namespace: mockNamespace,
      strategy: 'sequential',
      loops: false,
      members: [],
    };

    const createSeededClient = () => {
      const client = createQueryClient();
      client.setQueryData(TEAMS_LIST_KEY, [existingTeam]);
      return client;
    };

    it('should invalidate the cached teams list after creating a team', async () => {
      mockTeamsService.create.mockResolvedValue(existingTeam);
      const client = createSeededClient();

      const { result } = renderUseTeamForm(
        { mode: TeamFormMode.CREATE },
        client,
      );

      await waitFor(() => {
        expect(result.current.state.loading).toBe(false);
      });

      await act(async () => {
        result.current.form.setValue('name', 'new-team');
        await result.current.actions.onSubmit(result.current.form.getValues());
      });

      expect(mockTeamsService.create).toHaveBeenCalled();
      expect(client.getQueryState(TEAMS_LIST_KEY)?.isInvalidated).toBe(true);
    });

    it('should invalidate the cached teams list after updating a team', async () => {
      mockTeamsService.getByName.mockResolvedValue(existingTeam);
      mockTeamsService.updateById.mockResolvedValue(existingTeam);
      const client = createSeededClient();

      const { result } = renderUseTeamForm(
        { mode: TeamFormMode.VIEW, teamName: 'existing' },
        client,
      );

      await waitFor(() => {
        expect(result.current.state.loading).toBe(false);
      });

      await act(async () => {
        await result.current.actions.onSubmit(result.current.form.getValues());
      });

      expect(mockTeamsService.updateById).toHaveBeenCalled();
      expect(client.getQueryState(TEAMS_LIST_KEY)?.isInvalidated).toBe(true);
    });

    it('should not invalidate the cached teams list when creation fails', async () => {
      mockTeamsService.create.mockRejectedValue(new Error('Network error'));
      const client = createSeededClient();

      const { result } = renderUseTeamForm(
        { mode: TeamFormMode.CREATE },
        client,
      );

      await waitFor(() => {
        expect(result.current.state.loading).toBe(false);
      });

      await act(async () => {
        result.current.form.setValue('name', 'fail-team');
        await result.current.actions.onSubmit(result.current.form.getValues());
      });

      expect(client.getQueryState(TEAMS_LIST_KEY)?.isInvalidated).toBe(false);
    });
  });
});
