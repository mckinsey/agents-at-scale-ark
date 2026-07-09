export const ARGO_MAKE_AUTHOR_AGENT_NAME =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT || 'argo-make-author';

export const ARGO_MAKE_GROUNDING_TOOLS = [
  'resources_list',
  'resources_get',
] as const;

export const ARGO_MAKE_AUTHOR_INSTALL_CMD =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_INSTALL_CMD ||
  'kubectl apply -f https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/agents/argo-make-author/agent.yaml';
