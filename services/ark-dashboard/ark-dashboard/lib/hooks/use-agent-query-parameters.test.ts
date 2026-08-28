import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { agentsService, teamsService, toolsService } from '@/lib/services';

import { useAgentQueryParameters } from './use-agent-query-parameters';

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: vi.fn(),
  },
  teamsService: {
    getByName: vi.fn(),
  },
  toolsService: {
    getAll: vi.fn(),
  },
}));

interface AgentStub {
  readonly executionEngine?: { readonly name: string };
  readonly tools?: readonly { readonly type: string; readonly name: string }[];
}

function mockAgent(agent: AgentStub) {
  vi.mocked(agentsService.getByName).mockResolvedValue(
    agent as Awaited<ReturnType<typeof agentsService.getByName>>,
  );
}

async function warningFor(agent: AgentStub) {
  mockAgent(agent);
  const { result } = renderHook(() =>
    useAgentQueryParameters('toolagent', 'agent'),
  );
  await waitFor(() =>
    expect(vi.mocked(agentsService.getByName)).toHaveBeenCalled(),
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function mockToolTypes(tools: readonly { name: string; type: string }[]) {
  vi.mocked(toolsService.getAll).mockResolvedValue(
    tools.map(tool => ({ ...tool, id: tool.name })),
  );
}

describe('useAgentQueryParameters - engineToolWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToolTypes([]);
  });

  it('warns and names every tool an engine will not receive', async () => {
    const result = await warningFor({
      executionEngine: { name: 'executor-claude-agent-sdk' },
      tools: [
        { type: 'http', name: 'get-coordinates' },
        { type: 'mcp', name: 'echo' },
        { type: 'team', name: 'delegate' },
      ],
    });

    expect(result.current.engineToolWarning).toBeTruthy();
    const warning = result.current.engineToolWarning as string;
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

    expect(result.current.engineToolWarning).toBeTruthy();
    const warning = result.current.engineToolWarning as string;
    expect(warning).toContain('get-coordinates (http)');
    expect(warning).not.toContain('echo');
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

    expect(vi.mocked(toolsService.getAll)).not.toHaveBeenCalled();
  });

  it.each([
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
    ['there is no engine', { tools: [{ type: 'http', name: 'get-coordinates' }] }],
    ['the engine agent has no tools', { executionEngine: { name: 'mock-engine' } }],
  ])('stays quiet when %s', async (_label, agent) => {
    const result = await warningFor(agent);
    expect(result.current.engineToolWarning).toBeNull();
  });

  it('stays quiet for team targets', async () => {
    vi.mocked(teamsService.getByName).mockResolvedValue(null);
    const { result } = renderHook(() =>
      useAgentQueryParameters('someteam', 'team'),
    );
    await waitFor(() =>
      expect(vi.mocked(teamsService.getByName)).toHaveBeenCalled(),
    );
    expect(result.current.engineToolWarning).toBeNull();
  });
});
