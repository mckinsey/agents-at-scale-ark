import { KUBERNETES_MCP_SERVER_NAME } from '@/lib/constants/argo-make';
import { agentsService } from '@/lib/services/agents';
import { mcpServersService } from '@/lib/services/mcp-servers';

interface AxiosError extends Error {
  response?: {
    status?: number;
  };
}

export interface AuthorAgentPreflight {
  agentPresent: boolean;
  agentReady: boolean;
  mcpServerPresent: boolean;
  mcpServerReady: boolean;
}

async function getMcpServerOrNull(name: string) {
  try {
    return await mcpServersService.get(name);
  } catch (error) {
    if ((error as AxiosError).response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getAuthorAgentPreflight(
  agentName: string,
): Promise<AuthorAgentPreflight> {
  const [agent, mcpServer] = await Promise.all([
    agentsService.getByName(agentName),
    getMcpServerOrNull(KUBERNETES_MCP_SERVER_NAME),
  ]);

  return {
    agentPresent: agent !== null,
    agentReady: agent?.available === 'True',
    mcpServerPresent: mcpServer !== null,
    mcpServerReady: mcpServer?.available === 'True',
  };
}
