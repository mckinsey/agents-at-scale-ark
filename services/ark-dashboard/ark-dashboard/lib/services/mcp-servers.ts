import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import { fetchAllPages } from '@/lib/api/pagination';
import type { components } from '@/lib/api/generated/types';

export type MCPServerResponse = components['schemas']['MCPServerResponse'];
export type MCPServerDetailResponse =
  components['schemas']['MCPServerDetailResponse'];
export type MCPServerListResponse =
  components['schemas']['MCPServerListResponse'];
export type MCPServerCreateRequest =
  components['schemas']['MCPServerCreateRequest'];
export type MCPServerSpec = components['schemas']['MCPServerSpec'];
export type MCPHeader = components['schemas']['MCPServerHeader-Output'];
export type MCPServerAddressSource =
  components['schemas']['MCPServerAddressSource'];
export type MCPServerServiceRef =
  components['schemas']['MCPServerServiceRef'];

export type MCPServer = MCPServerResponse & { id: string };
export type MCPServerDetail = MCPServerDetailResponse & { id: string };

export type MCPServerAuthorization =
  components['schemas']['MCPServerAuthorization'];
export type AuthStartResponse = components['schemas']['AuthStartResponse'];
export type AuthStatusResponse = components['schemas']['AuthStatusResponse'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];

export interface StartAuthOptions {
  namespace: string;
  force?: boolean;
}

export interface LogoutAuthOptions {
  namespace: string;
}

export interface AuthStatusOptions {
  authId: string;
  namespace: string;
}

export type DirectHeader = {
  name: string;
  value: {
    value: string;
  };
};

export type SecretHeader = {
  name: string;
  value: {
    valueFrom: ValueFrom;
  };
};

export type ValueFrom = {
  secretKeyRef: {
    name: string;
    key: string;
  };
};

// Service for MCP server operations
export const mcpServersService = {
  // List and detail responses compute `available` identically, no per-item fetch needed (#2581)
  async getAll(namespace: string): Promise<MCPServer[]> {
    const items = await fetchAllPages<MCPServerResponse>(
      `/api/v1/mcp-servers`,
      { namespace },
    );

    return items.map(item => ({
      ...item,
      id: item.name,
    }));
  },

  async get(
    namespace: string,
    mcpServerName: string,
  ): Promise<MCPServerDetail | null> {
    try {
      const response = await apiClient.get<MCPServerDetailResponse>(
        `/api/v1/mcp-servers/${mcpServerName}`,
        { params: { namespace } },
      );
      return {
        ...response,
        id: response.name, // Use name as id for UI compatibility
      };
    } catch (error) {
      throw error;
    }
  },

  async delete(namespace: string, identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/mcp-servers/${identifier}`, {
      params: { namespace },
    });

    trackEvent({
      name: 'mcp_server_deleted',
      properties: {
        mcpServerName: identifier,
      },
    });
  },

  async create(
    namespace: string,
    mcpSever: MCPServerCreateRequest,
  ): Promise<MCPServer> {
    const response = await apiClient.post<MCPServerDetailResponse>(
      `/api/v1/mcp-servers`,
      mcpSever,
      { params: { namespace } },
    );

    trackEvent({
      name: 'mcp_server_created',
      properties: {
        mcpServerName: response.name,
      },
    });

    return {
      ...response,
      id: response.name,
    };
  },

  async update(
    namespace: string,
    mcpServerName: string,
    spec: { spec: MCPServerSpec },
  ): Promise<MCPServer> {
    const response = await apiClient.put<MCPServerDetailResponse>(
      `/api/v1/mcp-servers/${mcpServerName}`,
      spec,
      { params: { namespace } },
    );
    return {
      ...response,
      id: response.name,
    };
  },

  // Start an MCP auth flow. redirect_on_complete is always set so the callback
  // redirects the browser back to the dashboard.
  async startAuth(
    mcpServerName: string,
    { namespace, force }: StartAuthOptions,
  ): Promise<AuthStartResponse> {
    const body: components['schemas']['AuthStartRequest'] = {
      redirect_on_complete: true,
    };
    if (force) {
      body.force = true;
    }
    return apiClient.post<AuthStartResponse>(
      `/api/v1/mcp-servers/${mcpServerName}/auth/start`,
      body,
      { params: { namespace } },
    );
  },

  // Poll completion of an in-flight auth flow.
  async getAuthStatus(
    mcpServerName: string,
    { authId, namespace }: AuthStatusOptions,
  ): Promise<AuthStatusResponse> {
    return apiClient.get<AuthStatusResponse>(
      `/api/v1/mcp-servers/${mcpServerName}/auth/status`,
      { params: { auth_id: authId, namespace } },
    );
  },

  // Revoke an MCP authorization (default clear: tokens cleared, Secret kept).
  async logoutAuth(
    mcpServerName: string,
    { namespace }: LogoutAuthOptions,
  ): Promise<AuthLogoutResponse> {
    return apiClient.post<AuthLogoutResponse>(
      `/api/v1/mcp-servers/${mcpServerName}/auth/logout`,
      {},
      { params: { namespace } },
    );
  },
};
