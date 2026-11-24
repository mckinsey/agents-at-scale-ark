import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@/lib/api/client';
import { agentsService } from '@/lib/services/agents';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { mcpServersService } from '@/lib/services/mcp-servers';

vi.mock('@/lib/services/agents', () => ({
  agentsService: {
    getByName: vi.fn(),
  },
}));

vi.mock('@/lib/services/mcp-servers', () => ({
  mcpServersService: {
    get: vi.fn(),
  },
}));

const readyAgent = {
  id: 'argo-make-author',
  name: 'argo-make-author',
  namespace: 'default',
  isA2A: false,
  available: 'True',
};

const readyMcpServer = {
  id: 'kubernetes-mcp-server',
  name: 'kubernetes-mcp-server',
  available: 'True',
};

function httpError(status: number): Error {
  return new APIError(`HTTP ${status}`, status);
}

describe('getAuthorAgentPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports everything present and ready', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(mcpServersService.get).mockResolvedValueOnce(readyMcpServer);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result).toEqual({
      agentPresent: true,
      agentReady: true,
      mcpServerPresent: true,
      mcpServerReady: true,
      unverifiable: false,
    });
  });

  it('reports agentPresent=false when the agent is missing', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(null);
    vi.mocked(mcpServersService.get).mockResolvedValueOnce(readyMcpServer);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.agentPresent).toBe(false);
    expect(result.agentReady).toBe(false);
  });

  it('reports agentReady=false when available is not True', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce({
      ...readyAgent,
      available: 'False',
    });
    vi.mocked(mcpServersService.get).mockResolvedValueOnce(readyMcpServer);

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.agentPresent).toBe(true);
    expect(result.agentReady).toBe(false);
  });

  it('reports mcpServerPresent=false when the MCP server 404s', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(mcpServersService.get).mockRejectedValueOnce(httpError(404));

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.mcpServerPresent).toBe(false);
    expect(result.mcpServerReady).toBe(false);
  });

  it('reports mcpServerReady=false when the MCP server is not available', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(mcpServersService.get).mockResolvedValueOnce({
      ...readyMcpServer,
      available: 'False',
    });

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.mcpServerPresent).toBe(true);
    expect(result.mcpServerReady).toBe(false);
  });

  it('fails closed for the failing lookup on unknown errors without discarding the other success', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(mcpServersService.get).mockRejectedValueOnce(httpError(500));

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.agentPresent).toBe(true);
    expect(result.agentReady).toBe(true);
    expect(result.mcpServerPresent).toBe(false);
    expect(result.mcpServerReady).toBe(false);
    expect(result.unverifiable).toBe(false);
  });

  it.each([401, 403])(
    'marks the result unverifiable and preserves the agent success when the MCP lookup returns %i',
    async status => {
      vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
      vi.mocked(mcpServersService.get).mockRejectedValueOnce(httpError(status));

      const result = await getAuthorAgentPreflight('argo-make-author');

      expect(result.unverifiable).toBe(true);
      expect(result.agentPresent).toBe(true);
      expect(result.agentReady).toBe(true);
      expect(result.mcpServerPresent).toBe(false);
      expect(result.mcpServerReady).toBe(false);
    },
  );

  it.each([401, 403])(
    'marks the result unverifiable and preserves the MCP success when the agent lookup returns %i',
    async status => {
      vi.mocked(agentsService.getByName).mockRejectedValueOnce(
        httpError(status),
      );
      vi.mocked(mcpServersService.get).mockResolvedValueOnce(readyMcpServer);

      const result = await getAuthorAgentPreflight('argo-make-author');

      expect(result.unverifiable).toBe(true);
      expect(result.agentPresent).toBe(false);
      expect(result.agentReady).toBe(false);
      expect(result.mcpServerPresent).toBe(true);
      expect(result.mcpServerReady).toBe(true);
    },
  );

  it('does not mark the result unverifiable when the MCP server 404s', async () => {
    vi.mocked(agentsService.getByName).mockResolvedValueOnce(readyAgent);
    vi.mocked(mcpServersService.get).mockRejectedValueOnce(httpError(404));

    const result = await getAuthorAgentPreflight('argo-make-author');

    expect(result.unverifiable).toBe(false);
    expect(result.mcpServerPresent).toBe(false);
  });
});
