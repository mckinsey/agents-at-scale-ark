import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';

// A2A Server interface for UI compatibility
export interface A2AServer {
  id: string;
  name: string;
  namespace: string;
  type?: string;
  spec?: A2AServerSpec;
  description?: string;
  address?: string;
  ready?: boolean;
  discovering?: boolean;
  status_message?: string;
  annotations?: Record<string, string>;
}

// A2A Server list response
interface A2AServerListResponse {
  items: A2AServer[];
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
export interface A2AServerSpec {
  address: {
    value: string;
  };
  description?: string;
  headers?: Header[];
  pollingInterval?: number;
  timeout?: string;
}

export interface A2AServerConfiguration {
  name: string;
  namespace: string;
  spec: A2AServerSpec;
}

// Service for A2A server operations
export const A2AServersService = {
  // Get all A2A servers in a namespace
  async getAll(): Promise<A2AServer[]> {
    const response =
      await apiClient.get<A2AServerListResponse>(`/api/v1/a2a-servers`);
    console.log('A2A Servers:', response.items);
    return response.items.map(item => ({
      ...item,
      id: item.name,
    }));
  },

  async get(A2AServerName: string): Promise<A2AServer> {
    const response = await apiClient.get<A2AServer>(
      `/api/v1/a2a-servers/${A2AServerName}`,
    );
    return {
      ...response,
      id: response.name,
    };
  },

  // Delete an A2A server
  async delete(identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/a2a-servers/${identifier}`);
    trackEvent({
      name: 'a2a_server_deleted',
      properties: { serverName: identifier },
    });
  },

  async create(A2ASever: A2AServerConfiguration): Promise<A2AServer> {
    const response = await apiClient.post<A2AServer>(
      `/api/v1/a2a-servers`,
      A2ASever,
    );
    trackEvent({
      name: 'a2a_server_created',
      properties: { serverName: response.name },
    });
    return {
      ...response,
      id: response.name,
    };
  },

  async update(
    A2AServerName: string,
    spec: { spec: A2AServerSpec },
  ): Promise<A2AServer> {
    const response = await apiClient.put<A2AServer>(
      `/api/v1/a2a-servers/${A2AServerName}`,
      spec,
    );
    trackEvent({
      name: 'a2a_server_updated',
      properties: { serverName: response.name },
    });
    return {
      ...response,
      id: response.name,
    };
  },
};
