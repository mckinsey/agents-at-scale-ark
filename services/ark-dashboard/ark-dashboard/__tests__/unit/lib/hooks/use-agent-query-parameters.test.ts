import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';

const mockGetByName = vi.fn();
const mockTeamGetByName = vi.fn();

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
  teamsService: {
    getByName: (...args: unknown[]) => mockTeamGetByName(...args),
  },
}));

const agentWithQueryParam = {
  parameters: [
    { name: 'bakedWord', value: 'ZIBBLEFROST' },
    { name: 'queryWord', valueFrom: { queryParameterRef: { name: 'muting' } } },
  ],
};

describe('useAgentQueryParameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByName.mockResolvedValue({ parameters: [] });
    mockTeamGetByName.mockResolvedValue({ members: [] });
  });

  it('exposes only query-sourced parameters by their queryParameterRef name', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });
    // bakedWord has a direct value and is excluded
    expect(result.current.availableParameters).not.toContain('bakedWord');
  });

  it('strips a team/agent prefix before fetching the agent', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    renderHook(() =>
      useAgentQueryParameters('my-team/param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('param-test-agent');
    });
  });

  it('starts with an empty row list and caps additions at the available count', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.canAddRow).toBe(true);

    act(() => result.current.addRow());
    expect(result.current.rows).toHaveLength(1);
    // one available parameter -> cap reached
    expect(result.current.canAddRow).toBe(false);

    act(() => result.current.addRow());
    expect(result.current.rows).toHaveLength(1);
  });

  it('reports every available parameter as missing until a row supplies a value', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.missingParameters).toEqual(['muting']);
    });

    act(() => result.current.addRow());
    const rowId = result.current.rows[0].id;

    act(() => result.current.setRowName(rowId, 'muting'));
    // selected but no value yet -> still missing
    expect(result.current.missingParameters).toEqual(['muting']);

    act(() => result.current.setRowValue(rowId, 'BANANAPHONE'));
    expect(result.current.missingParameters).toEqual([]);
  });

  it('treats whitespace-only values as missing', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });

    act(() => result.current.addRow());
    const rowId = result.current.rows[0].id;
    act(() => result.current.setRowName(rowId, 'muting'));
    act(() => result.current.setRowValue(rowId, '   '));

    expect(result.current.missingParameters).toEqual(['muting']);
  });

  it('removeRow drops the row and re-reports its parameter as missing', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });

    act(() => result.current.addRow());
    const rowId = result.current.rows[0].id;
    act(() => result.current.setRowName(rowId, 'muting'));
    act(() => result.current.setRowValue(rowId, 'BANANAPHONE'));
    expect(result.current.missingParameters).toEqual([]);

    act(() => result.current.removeRow(rowId));
    expect(result.current.rows).toEqual([]);
    expect(result.current.missingParameters).toEqual(['muting']);
  });

  it('toApiParameters returns completed rows, or undefined when no params are declared', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result } = renderHook(() =>
      useAgentQueryParameters('param-test-agent', 'agent'),
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });

    act(() => result.current.addRow());
    const rowId = result.current.rows[0].id;
    act(() => result.current.setRowName(rowId, 'muting'));
    act(() => result.current.setRowValue(rowId, 'BANANAPHONE'));

    expect(result.current.toApiParameters()).toEqual([
      { name: 'muting', value: 'BANANAPHONE' },
    ]);
  });

  it('clears state when the agent fetch fails', async () => {
    mockGetByName.mockResolvedValue(agentWithQueryParam);

    const { result, rerender } = renderHook(
      ({ name }) => useAgentQueryParameters(name, 'agent'),
      { initialProps: { name: 'param-test-agent' } },
    );

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual(['muting']);
    });

    mockGetByName.mockRejectedValueOnce(new Error('not found'));
    rerender({ name: 'missing-agent' });

    await waitFor(() => {
      expect(result.current.availableParameters).toEqual([]);
    });
    expect(result.current.rows).toEqual([]);
  });

  describe('team participants', () => {
    const team = {
      members: [
        { name: 'agent-1', type: 'agent' },
        { name: 'agent-2', type: 'agent' },
        { name: 'nested-team', type: 'team' },
      ],
    };

    const agentParams = (refs: string[]) => ({
      parameters: refs.map(name => ({
        name,
        valueFrom: { queryParameterRef: { name } },
      })),
    });

    it('unions query parameters across member agents and ignores nested teams', async () => {
      mockTeamGetByName.mockResolvedValue(team);
      mockGetByName.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'agent-1'
            ? agentParams(['topic', 'region'])
            : agentParams(['language']),
        ),
      );

      const { result } = renderHook(() =>
        useAgentQueryParameters('team-hr', 'team'),
      );

      await waitFor(() => {
        expect(result.current.teamAgents).toEqual([
          { name: 'agent-1', parameters: ['topic', 'region'] },
          { name: 'agent-2', parameters: ['language'] },
        ]);
      });
      expect(result.current.variant).toBe('team');
      expect(result.current.hasParameters).toBe(true);
      // nested team member is not expanded into an agent fetch
      expect(mockGetByName).not.toHaveBeenCalledWith('nested-team');
    });

    it('allows three variable slots and reports them all missing until filled', async () => {
      mockTeamGetByName.mockResolvedValue(team);
      mockGetByName.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'agent-1'
            ? agentParams(['topic', 'region'])
            : agentParams(['language']),
        ),
      );

      const { result } = renderHook(() =>
        useAgentQueryParameters('team-hr', 'team'),
      );

      await waitFor(() => {
        expect(result.current.missingParameters).toEqual([
          'topic',
          'region',
          'language',
        ]);
      });

      act(() => result.current.addRow());
      act(() => result.current.addRow());
      act(() => result.current.addRow());
      expect(result.current.canAddRow).toBe(false);
    });

    it('resets the variable when the row agent changes to one without it', async () => {
      mockTeamGetByName.mockResolvedValue(team);
      mockGetByName.mockImplementation((name: string) =>
        Promise.resolve(
          name === 'agent-1'
            ? agentParams(['topic', 'region'])
            : agentParams(['language']),
        ),
      );

      const { result } = renderHook(() =>
        useAgentQueryParameters('team-hr', 'team'),
      );

      await waitFor(() => {
        expect(result.current.teamAgents).toHaveLength(2);
      });

      act(() => result.current.addRow());
      const rowId = result.current.rows[0].id;
      act(() => result.current.setRowAgent(rowId, 'agent-1'));
      act(() => result.current.setRowName(rowId, 'topic'));
      expect(result.current.rows[0].name).toBe('topic');

      act(() => result.current.setRowAgent(rowId, 'agent-2'));
      expect(result.current.rows[0].name).toBe('');
    });

    it('dedupes shared variable names into a single flat query parameter', async () => {
      mockTeamGetByName.mockResolvedValue({
        members: [
          { name: 'agent-1', type: 'agent' },
          { name: 'agent-2', type: 'agent' },
        ],
      });
      // Both agents reference a query parameter named "topic".
      mockGetByName.mockResolvedValue(agentParams(['topic']));

      const { result } = renderHook(() =>
        useAgentQueryParameters('team-hr', 'team'),
      );

      await waitFor(() => {
        expect(result.current.teamAgents).toHaveLength(2);
      });

      act(() => result.current.addRow());
      act(() => result.current.addRow());
      const [r1, r2] = result.current.rows;
      act(() => result.current.setRowAgent(r1.id, 'agent-1'));
      act(() => result.current.setRowName(r1.id, 'topic'));
      act(() => result.current.setRowValue(r1.id, 'first'));
      act(() => result.current.setRowAgent(r2.id, 'agent-2'));
      act(() => result.current.setRowName(r2.id, 'topic'));
      act(() => result.current.setRowValue(r2.id, 'second'));

      // last completed row wins for a shared name
      expect(result.current.toApiParameters()).toEqual([
        { name: 'topic', value: 'second' },
      ]);
      expect(result.current.missingParameters).toEqual([]);
    });

    it('clears team state when the team fetch fails', async () => {
      mockTeamGetByName.mockRejectedValue(new Error('not found'));

      const { result } = renderHook(() =>
        useAgentQueryParameters('team-hr', 'team'),
      );

      await waitFor(() => {
        expect(result.current.teamAgents).toEqual([]);
      });
      expect(result.current.hasParameters).toBe(false);
      expect(result.current.toApiParameters()).toBeUndefined();
    });
  });
});
