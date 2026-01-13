import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';

// Tool interface for UI compatibility
export interface Tool {
  id: string;
  name: string;
  type?: string;
  description?: string;
  annotations?: unknown;
  labels?: unknown;
}

// Tool detail response with schema
export interface ToolDetail {
  name: string;
  namespace: string;
  description?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  spec?: {
    inputSchema?: Record<string, unknown>;
    [key: string]: unknown;
    type: string;
  };
  status?: Record<string, unknown>;
}

// Tool list response
interface ToolListResponse {
  items: Tool[];
  count: number;
}

// Service for tool operations
export const toolsService = {
  // Get all tools in a namespace
  async getAll(): Promise<Tool[]> {
    const response = await apiClient.get<ToolListResponse>(`/api/v1/tools`);
    return response.items.map(item => ({ ...item, id: item.name }));
  },

  // Get detailed tool information including schema
  async getDetail(toolName: string): Promise<ToolDetail> {
    const response = await apiClient.get<ToolDetail>(
      `/api/v1/tools/${toolName}`,
    );
    return response;
  },

  async delete(identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/tools/${identifier}`);

    trackEvent({
      name: 'tool_deleted',
      properties: {
        toolName: identifier,
      },
    });
  },

  // Create a new tool
  async create(tool: {
    name: string;
    type: string;
    description: string;
    inputSchema?: Record<string, unknown> | string;
    annotations?: Record<string, string>;
    url?: string;
    agent?: string;
    team?: string;
    namespace?: string;
  }): Promise<void> {
    const {
      name,
      type,
      description,
      inputSchema,
      annotations,
      url,
      agent,
      team,
      namespace,
    } = tool;
    let parsedInputSchema: Record<string, unknown> | undefined = undefined;
    if (typeof inputSchema === 'string' && inputSchema.trim()) {
      try {
        parsedInputSchema = JSON.parse(inputSchema);
      } catch {
        parsedInputSchema = undefined;
      }
    } else if (typeof inputSchema === 'object' && inputSchema !== null) {
      parsedInputSchema = inputSchema;
    }
    const spec: Record<string, unknown> = {
      type,
      description,
      ...(parsedInputSchema ? { inputSchema: parsedInputSchema } : {}),
      ...(type === 'http' && url ? { http: { url } } : {}),
      ...(type === 'agent' && agent ? { agent: { name: agent } } : {}),
      ...(type === 'team' && team ? { team: { name: team } } : {}),
    };
    const payload = {
      name,
      namespace: namespace || 'default',
      annotations,
      spec,
    };
    await apiClient.post(`/api/v1/tools`, payload);

    trackEvent({
      name: 'tool_created',
      properties: {
        toolName: name,
        toolType: type,
      },
    });
  },
};
