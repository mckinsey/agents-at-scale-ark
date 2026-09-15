import { APIError } from '@/lib/api/client';
import { KUBERNETES_MCP_SERVER_NAME } from '@/lib/constants/argo-make';
import { agentsService } from '@/lib/services/agents';
import { mcpServersService } from '@/lib/services/mcp-servers';

export interface AuthorAgentPreflight {
  agentPresent: boolean;
  agentReady: boolean;
  mcpServerPresent: boolean;
  mcpServerReady: boolean;
  unverifiable: boolean;
}

function isAuthError(error: unknown): boolean {
  return (
    error instanceof APIError && (error.status === 401 || error.status === 403)
  );
}

export async function getAuthorAgentPreflight(
  namespace: string,
  agentName: string,
): Promise<AuthorAgentPreflight> {
  const [agentResult, mcpServerResult] = await Promise.allSettled([
    agentsService.getByName(namespace, agentName),
    mcpServersService.get(namespace, KUBERNETES_MCP_SERVER_NAME),
  ]);

  let unverifiable = false;

  let agentPresent = false;
  let agentReady = false;
  if (agentResult.status === 'fulfilled') {
    agentPresent = agentResult.value !== null;
    agentReady = agentResult.value?.available === 'True';
  } else if (isAuthError(agentResult.reason)) {
    unverifiable = true;
  }

  let mcpServerPresent = false;
  let mcpServerReady = false;
  if (mcpServerResult.status === 'fulfilled') {
    mcpServerPresent = mcpServerResult.value !== null;
    mcpServerReady = mcpServerResult.value?.available === 'True';
  } else if (isAuthError(mcpServerResult.reason)) {
    unverifiable = true;
  }

  return {
    agentPresent,
    agentReady,
    mcpServerPresent,
    mcpServerReady,
    unverifiable,
  };
}
