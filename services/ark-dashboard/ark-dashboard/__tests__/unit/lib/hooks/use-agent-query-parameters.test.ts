import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentQueryParameters } from '@/lib/hooks/use-agent-query-parameters';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

const mockGetByName = vi.fn();
const mockTeamGetByName = vi.fn();
const mockToolsGetAll = vi.fn();

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
  teamsService: {
    getByName: (...args: unknown[]) => mockTeamGetByName(...args),
  },
  toolsService: {
    getAll: (...args: unknown[]) => mockToolsGetAll(...args),
  },
}));

const agentWithQueryParam = {
  parameters: [
    { name: 'bakedWord', value: 'ZIBBLEFROST' },
    { name: 'queryWord', valueFrom: { queryParameterRef: { name: 'muting' } } },
  ],
};

interface AgentToolStub {
  readonly type: string;
  readonly name: string;
}

interface AgentStub {
  readonly executionEngine?: { readonly name: string };
  readonly tools?: readonly AgentToolStub[];
}

describe('useAgentQueryParameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByName.mockResolvedValue({ parameters: [] });
    mockTeamGetByName.mockResolvedValue({ members: [] });
    mockToolsGetAll.mockResolvedValue([]);
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
      expect(mockGetByName).toHaveBeenCalledWith('default', 'param-test-agent');
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
      mockGetByName.mockImplementation((_namespace: string, name: string) =>
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
      expect(mockGetByName).not.toHaveBeenCalledWith('default', 'nested-team');
    });

    it('allows three variable slots and reports them all missing until filled', async () => {
      mockTeamGetByName.mockResolvedValue(team);
      mockGetByName.mockImplementation((_namespace: string, name: string) =>
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
      mockGetByName.mockImplementation((_namespace: string, name: string) =>
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

  describe('engineToolWarning', () => {
    const mockToolTypes = (tools: readonly AgentToolStub[]) => {
      mockToolsGetAll.mockResolvedValue(
        tools.map(tool => ({ ...tool, id: tool.name })),
      );
    };

    const warningFor = async (agent: AgentStub) => {
      mockGetByName.mockResolvedValue(agent);

      const { result } = renderHook(() =>
        useAgentQueryParameters('toolagent', 'agent'),
      );

      await waitFor(() => {
        expect(mockGetByName).toHaveBeenCalled();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      return result;
    };

    it('warns and names every tool an engine will not receive', async () => {
      const result = await warningFor({
        executionEngine: { name: 'executor-claude-agent-sdk' },
        tools: [
          { type: 'http', name: 'get-coordinates' },
          { type: 'mcp', name: 'echo' },
          { type: 'team', name: 'delegate' },
        ],
      });

      const warning = result.current.engineToolWarning;
      expect(warning).toBeTruthy();
      expect(warning).toContain('executor-claude-agent-sdk');
      expect(warning).toContain('get-coordinates (http)');
      expect(warning).toContain('delegate (team)');
      expect(warning).not.toContain('echo');
    });

    it('resolves the deprecated custom type from the tool list', async () => {
      mockToolTypes([
        { name: 'get-coordinates', type: 'http' },
        { name: 'echo', type: 'mcp' },
      ]);

      const result = await warningFor({
        executionEngine: { name: 'mock-engine' },
        tools: [
          { type: 'custom', name: 'get-coordinates' },
          { type: 'custom', name: 'echo' },
        ],
      });

      const warning = result.current.engineToolWarning;
      expect(warning).toContain('get-coordinates (http)');
      expect(warning).not.toContain('echo');
    });

    it('fetches the tool list for the active namespace', async () => {
      mockToolTypes([{ name: 'get-coordinates', type: 'http' }]);

      await warningFor({
        executionEngine: { name: 'mock-engine' },
        tools: [{ type: 'custom', name: 'get-coordinates' }],
      });

      expect(mockToolsGetAll).toHaveBeenCalledWith('default');
    });

    it('resolves a built-in tool through its Tool CRD type', async () => {
      mockToolTypes([{ name: 'terminate', type: 'builtin' }]);

      const result = await warningFor({
        executionEngine: { name: 'mock-engine' },
        tools: [{ type: 'built-in', name: 'terminate' }],
      });

      expect(result.current.engineToolWarning).toContain('terminate (builtin)');
    });

    it('stays quiet when a custom tool cannot be resolved', async () => {
      mockToolTypes([]);

      const result = await warningFor({
        executionEngine: { name: 'mock-engine' },
        tools: [{ type: 'custom', name: 'unknown-tool' }],
      });

      expect(result.current.engineToolWarning).toBeNull();
    });

    it('does not fetch the tool list when every declared type names the tool', async () => {
      await warningFor({
        executionEngine: { name: 'mock-engine' },
        tools: [{ type: 'http', name: 'get-coordinates' }],
      });

      expect(mockToolsGetAll).not.toHaveBeenCalled();
    });

    it.each<[string, AgentStub]>([
      [
        'every tool is mcp',
        {
          executionEngine: { name: 'mock-engine' },
          tools: [{ type: 'mcp', name: 'echo' }],
        },
      ],
      [
        'a built-in tool cannot be resolved',
        {
          executionEngine: { name: 'mock-engine' },
          tools: [{ type: 'built-in', name: 'terminate' }],
        },
      ],
      [
        'the engine is the built-in a2a engine',
        {
          executionEngine: { name: 'a2a' },
          tools: [{ type: 'http', name: 'get-coordinates' }],
        },
      ],
      [
        'there is no engine',
        { tools: [{ type: 'http', name: 'get-coordinates' }] },
      ],
      [
        'the engine agent has no tools',
        { executionEngine: { name: 'mock-engine' } },
      ],
    ])('stays quiet when %s', async (_label, agent) => {
      const result = await warningFor(agent);
      expect(result.current.engineToolWarning).toBeNull();
    });

    it('stays quiet for team targets', async () => {
      mockTeamGetByName.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useAgentQueryParameters('someteam', 'team'),
      );

      await waitFor(() => {
        expect(mockTeamGetByName).toHaveBeenCalled();
      });
      expect(result.current.engineToolWarning).toBeNull();
    });
  });
});
