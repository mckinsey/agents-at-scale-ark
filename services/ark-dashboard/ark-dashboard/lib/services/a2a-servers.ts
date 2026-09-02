import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';
import { fetchAllPages } from '@/lib/api/pagination';

type A2AServerListPayload = components['schemas']['A2AServerResponse'];
type A2AServerDetailPayload = components['schemas']['A2AServerDetailResponse'];

export interface A2AServer extends A2AServerListPayload {
  id: string;
}

export interface A2AServerDetail extends A2AServerDetailPayload {
  id: string;
}

export interface A2AServerStatusSummary {
  ready?: boolean;
  discovering?: boolean;
  statusMessage?: string;
  address?: string;
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Mirrors a2a_server_to_response in ark-api: the detail endpoint returns the
 * raw CR status, so the list page's derived fields must be recomputed here or
 * the two views disagree.
 */
export function summarizeA2AServerStatus(
  status: A2AServerDetail['status'],
): A2AServerStatusSummary {
  if (!isRecord(status)) {
    return {};
  }

  const summary: A2AServerStatusSummary = {
    address: readString(status, 'lastResolvedAddress'),
  };

  const conditions = status.conditions;
  if (!Array.isArray(conditions)) {
    return summary;
  }

  for (const condition of conditions) {
    if (!isRecord(condition)) {
      continue;
    }
    const type = readString(condition, 'type');
    const isTrue = readString(condition, 'status') === 'True';
    if (type === 'Ready') {
      summary.ready = isTrue;
      if (!isTrue) {
        summary.statusMessage = readString(condition, 'message');
      }
    } else if (type === 'Discovering') {
      summary.discovering = isTrue;
    }
  }

  return summary;
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
  async getAll(namespace: string): Promise<A2AServer[]> {
    const items = await fetchAllPages<Omit<A2AServer, 'id'>>(
      `/api/v1/a2a-servers`,
      { namespace },
    );
    return items.map(item => ({
      ...item,
      id: item.name,
    }));
  },

  async get(
    namespace: string,
    A2AServerName: string,
  ): Promise<A2AServerDetail> {
    const response = await apiClient.get<A2AServerDetail>(
      `/api/v1/a2a-servers/${A2AServerName}`,
      { params: { namespace } },
    );
    return {
      ...response,
      id: response.name,
    };
  },

  // Delete an A2A server
  async delete(namespace: string, identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/a2a-servers/${identifier}`, {
      params: { namespace },
    });
    trackEvent({
      name: 'a2a_server_deleted',
      properties: { serverName: identifier },
    });
  },

  async create(
    namespace: string,
    A2ASever: A2AServerConfiguration,
  ): Promise<A2AServerDetail> {
    const response = await apiClient.post<A2AServerDetail>(
      `/api/v1/a2a-servers`,
      A2ASever,
      { params: { namespace } },
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
    namespace: string,
    A2AServerName: string,
    spec: { spec: A2AServerSpec },
  ): Promise<A2AServerDetail> {
    const response = await apiClient.put<A2AServerDetail>(
      `/api/v1/a2a-servers/${A2AServerName}`,
      spec,
      { params: { namespace } },
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
