import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsService } from '@/lib/services/agents';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { toolsService } from '@/lib/services/tools';

vi.mock('@/lib/services/agents', () => ({
  agentsService: {
    getByName: vi.fn(),
  },
}));

vi.mock('@/lib/services/tools', () => ({
  toolsService: {
    getAll: vi.fn(),
  },
}));

const readyAgent = {
  id: 'argo-make-author',
  name: 'argo-make-author',
  namespace: 'default',
  isA2A: false,
  available: 'True',
  tools: [
    { type: 'mcp', name: 'resources_list' },
    { type: 'mcp', name: 'resources_get' },
  ],
};

const groundingTools = [
  { id: 'resources_list', name: 'resources_list' },
  { id: 'resources_get', name: 'resources_get' },
];

describe('getAuthorAgentPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all true for a ready agent with both tools and CRDs', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(toolsService.getAll).mockResolvedValueOnce(groundingTools);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result).toEqual({
      agentPresent: true,
      agentReady: true,
      mcpToolsOnAgent: true,
      mcpToolCrdsPresent: true,
    });
  });

  it('should report agentPresent=false when the agent is missing', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(null);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result).toEqual({
      agentPresent: false,
      agentReady: false,
      mcpToolsOnAgent: false,
      mcpToolCrdsPresent: false,
    });
    expect(toolsService.getAll).not.toHaveBeenCalled();
  });

  it('should report agentReady=false when available is not True', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce({
      ...readyAgent,
      available: 'False',
    });
    vi.mocked(toolsService.getAll).mockResolvedValueOnce(groundingTools);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.agentReady).toBe(false);
    expect(result.agentPresent).toBe(true);
  });

  it('should report mcpToolsOnAgent=false when a grounding tool is missing on the agent', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce({
      ...readyAgent,
      tools: [{ type: 'mcp', name: 'resources_list' }],
    });
    vi.mocked(toolsService.getAll).mockResolvedValueOnce(groundingTools);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.mcpToolsOnAgent).toBe(false);
    expect(result.mcpToolCrdsPresent).toBe(true);
  });

  it('should report mcpToolsOnAgent=false when the grounding tool is not type mcp', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce({
      ...readyAgent,
      tools: [
        { type: 'custom', name: 'resources_list' },
        { type: 'mcp', name: 'resources_get' },
      ],
    });
    vi.mocked(toolsService.getAll).mockResolvedValueOnce(groundingTools);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.mcpToolsOnAgent).toBe(false);
  });

  it('should report mcpToolCrdsPresent=false when a grounding tool CRD is missing', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(toolsService.getAll).mockResolvedValueOnce([
      { id: 'resources_list', name: 'resources_list' },
    ]);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.mcpToolCrdsPresent).toBe(false);
    expect(result.mcpToolsOnAgent).toBe(true);
  });
});
