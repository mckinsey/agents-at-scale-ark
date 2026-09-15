export const ARGO_MAKE_AUTHOR_AGENT_NAME =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT || 'argo-make-author';

export const KUBERNETES_MCP_SERVER_NAME =
  process.env.NEXT_PUBLIC_KUBERNETES_MCP_SERVER || 'kubernetes-mcp-server';

const ARK_MARKETPLACE_URL =
  'https://github.com/mckinsey/agents-at-scale-marketplace';

export const ARGO_MAKE_AUTHOR_MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_MARKETPLACE_URL ||
  ARK_MARKETPLACE_URL;

export const KUBERNETES_MCP_MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_KUBERNETES_MCP_MARKETPLACE_URL || ARK_MARKETPLACE_URL;
