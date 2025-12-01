import type { Tool } from '../services/tools';

export const groupToolsByLabel = (tools: Tool[]) => {
  const groups: Record<string, { tools: Tool[]; isMcp: boolean }> = {};

  tools.forEach(tool => {
    let groupName = 'Built in';
    let isMcp = false;

    // Group by tool type
    if (tool.type === 'agent') {
      groupName = 'Agent as tool';
      isMcp = false;
    } else if (tool.type === 'team') {
      groupName = 'Team as tool';
      isMcp = false;
    } else if (tool.type === 'http') {
      groupName = 'Built in';
      isMcp = false;
    } else if (tool.type === 'mcp') {
      // For MCP tools, use the server name from labels
      if (tool.labels && typeof tool.labels === 'object') {
        const labels = tool.labels as Record<string, string>;
        if (labels['mcp/server']) {
          groupName = labels['mcp/server'];
        } else {
          groupName = 'MCP Tools';
        }
      } else {
        groupName = 'MCP Tools';
      }
      isMcp = true;
    }

    if (!groups[groupName]) {
      groups[groupName] = { tools: [], isMcp };
    }
    groups[groupName].tools.push(tool);
  });

  return Object.entries(groups).map(([groupName, groupData]) => ({
    groupName,
    tools: groupData.tools,
    isMcp: groupData.isMcp,
  }));
};
