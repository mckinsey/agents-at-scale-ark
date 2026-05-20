import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServer, MCPServerDetail } from '@/lib/services/mcp-servers';

export type AuthorizationState = 'Authorized' | 'Required' | 'Unknown';

export interface AuthorizationInfo {
  state: AuthorizationState;
  authorizedBy?: string;
  authorizedAt?: string;
}

/**
 * Determines the authorization state of an MCP server based on its annotations.
 * Since the API doesn't return status.authorization.state directly, we infer it from:
 * - Presence of authorized-by/authorized-at annotations = Authorized
 * - Absence of annotations = Required or Unknown (depends on availability)
 */
export function getAuthorizationInfo(
  mcpServer: MCPServer | MCPServerDetail,
): AuthorizationInfo {
  const annotations = mcpServer.annotations as Record<string, string> | undefined;

  if (!annotations) {
    return { state: 'Unknown' };
  }

  const authorizedBy = annotations[ARK_ANNOTATIONS.AUTHORIZED_BY];
  const authorizedAt = annotations[ARK_ANNOTATIONS.AUTHORIZED_AT];

  if (authorizedBy && authorizedAt) {
    return {
      state: 'Authorized',
      authorizedBy,
      authorizedAt,
    };
  }

  // If server is unavailable and no auth annotations, it may require auth
  // However, we can't definitively say it requires OAuth vs other issues
  // So we return 'Required' if unavailable, 'Unknown' otherwise
  if (mcpServer.available === 'False') {
    return { state: 'Required' };
  }

  return { state: 'Unknown' };
}

/**
 * Formats the authorized-at timestamp for display
 */
export function formatAuthorizedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}
