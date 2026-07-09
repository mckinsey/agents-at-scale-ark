import { ARGO_MAKE_GROUNDING_TOOLS } from '@/lib/constants/argo-make';
import { agentsService } from '@/lib/services/agents';
import { toolsService } from '@/lib/services/tools';

export interface AuthorAgentPreflight {
  agentPresent: boolean;
  agentReady: boolean;
  mcpToolsOnAgent: boolean;
  mcpToolCrdsPresent: boolean;
}

interface AgentToolLike {
  type: string;
  name?: string | null;
}

function agentHasGroundingTools(
  tools: AgentToolLike[] | null | undefined,
): boolean {
  const mcpToolNames = new Set(
    (tools ?? [])
      .filter(tool => tool.type === 'mcp' && typeof tool.name === 'string')
      .map(tool => tool.name),
  );
  return ARGO_MAKE_GROUNDING_TOOLS.every(name => mcpToolNames.has(name));
}

export async function getAuthorAgentPreflight(
  agentName: string,
): Promise<AuthorAgentPreflight> {
  const agent = await agentsService.getByName(agentName);

  if (!agent) {
    return {
      agentPresent: false,
      agentReady: false,
      mcpToolsOnAgent: false,
      mcpToolCrdsPresent: false,
    };
  }

  const tools = await toolsService.getAll();
  const toolNames = new Set(tools.map(tool => tool.name));

  return {
    agentPresent: true,
    agentReady: agent.available === 'True',
    mcpToolsOnAgent: agentHasGroundingTools(agent.tools),
    mcpToolCrdsPresent: ARGO_MAKE_GROUNDING_TOOLS.every(name =>
      toolNames.has(name),
    ),
  };
}
