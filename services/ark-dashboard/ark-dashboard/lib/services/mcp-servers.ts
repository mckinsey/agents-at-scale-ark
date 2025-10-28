import { apiClient } from '@/lib/api/client';

// MCP Server interface for UI compatibility
export interface MCPServer {
  id: string;
  name: string;
  namespace: string;
  type?: string;
  spec?: MCPServerSpec;
  description?: string;
  address?: string;
  transport?: string;
  ready?: boolean;
  discovering?: boolean;
  status_message?: string;
  tool_count?: number;
  annotations?: Record<string, string>;
}

// MCP Server list response
interface MCPServerListResponse {
  items: MCPServer[];
  count: number;
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
    valueFrom: {
      secretKeyRef: {
        name: string;
        key: string;
      };
    };
  };
};

export type Header = DirectHeader | SecretHeader;
export interface MCPServerSpec {
  address: {
    value: string;
  };
  description?: string;
  headers?: Header[];
  transport: 'http' | 'sse';
  timeout?: string;
}

export interface MCPServerConfiguration {
  name: string;
  namespace: string;
  spec: MCPServerSpec;
}

// Service for MCP server operations
export const mcpServersService = {
  // Get all MCP servers in a namespace
  async getAll(): Promise<MCPServer[]> {
    const response =
      await apiClient.get<MCPServerListResponse>(`/api/v1/mcp-servers`);
    return response.items;
  },

  async get(mcpServerName: string): Promise<MCPServer> {
    const response = await apiClient.get<MCPServer>(
      `/api/v1/mcp-servers/${mcpServerName}`,
    );
    return response;
  },

  // Delete an MCP server
  async delete(identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/mcp-servers/${identifier}`);
  },

  async create(mcpSever: MCPServerConfiguration): Promise<MCPServer> {
    const response = await apiClient.post<MCPServer>(
      `/api/v1/mcp-servers`,
      mcpSever,
    );
    return response;
  },

  async update(
    mcpServerName: string,
    spec: { spec: MCPServerSpec },
  ): Promise<MCPServer> {
    const response = await apiClient.put<MCPServer>(
      `/api/v1/mcp-servers/${mcpServerName}`,
      spec,
    );
    return response;
  },
};
