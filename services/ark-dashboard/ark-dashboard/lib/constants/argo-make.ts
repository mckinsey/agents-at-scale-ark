import { buildMarketplaceItemUrl } from '@/lib/constants/marketplace';

export const ARGO_MAKE_AUTHOR_AGENT_NAME =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_AGENT || 'argo-make-author';

export const KUBERNETES_MCP_SERVER_NAME =
  process.env.NEXT_PUBLIC_KUBERNETES_MCP_SERVER || 'kubernetes-mcp-server';

export const ARGO_MAKE_AUTHOR_MARKETPLACE_ITEM_ID =
  process.env.NEXT_PUBLIC_ARGO_MAKE_AUTHOR_MARKETPLACE_ITEM ||
  'argo-make-author';

export const KUBERNETES_MCP_MARKETPLACE_ITEM_ID =
  process.env.NEXT_PUBLIC_KUBERNETES_MCP_MARKETPLACE_ITEM ||
  'kubernetes-mcp-server';

export const ARGO_MAKE_AUTHOR_MARKETPLACE_URL = buildMarketplaceItemUrl(
  ARGO_MAKE_AUTHOR_MARKETPLACE_ITEM_ID,
);

export const KUBERNETES_MCP_MARKETPLACE_URL = buildMarketplaceItemUrl(
  KUBERNETES_MCP_MARKETPLACE_ITEM_ID,
);
