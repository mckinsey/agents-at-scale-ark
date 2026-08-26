import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import { fetchAllPages } from '@/lib/api/pagination';

// Tool interface for UI compatibility
export interface Tool {
  id: string;
  name: string;
  type?: string;
  description?: string;
  annotations?: Record<string, string>;
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
    http?: { url?: string };
    agent?: { name?: string };
    team?: { name?: string };
    [key: string]: unknown;
    type: string;
  };
  status?: Record<string, unknown>;
}

// Fields shared by tool create and update used to build the tool spec
interface ToolSpecInput {
  type: string;
  description: string;
  inputSchema?: Record<string, unknown> | string;
  url?: string;
  agent?: string;
  team?: string;
}

// Build a Tool CR spec from form-level fields, parsing the input schema
function buildToolSpec({
  type,
  description,
  inputSchema,
  url,
  agent,
  team,
}: ToolSpecInput): Record<string, unknown> {
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
  return {
    type,
    description,
    ...(parsedInputSchema ? { inputSchema: parsedInputSchema } : {}),
    ...(type === 'http' && url ? { http: { url } } : {}),
    ...(type === 'agent' && agent ? { agent: { name: agent } } : {}),
    ...(type === 'team' && team ? { team: { name: team } } : {}),
  };
}

// Service for tool operations
export const toolsService = {
  // Get all tools in a namespace
  async getAll(): Promise<Tool[]> {
    const items = await fetchAllPages<Omit<Tool, 'id'>>(`/api/v1/tools`);
    return items.map(item => ({ ...item, id: item.name }));
  },

  // Get detailed tool information including schema
  async getDetail(namespace: string, toolName: string): Promise<ToolDetail> {
    const response = await apiClient.get<ToolDetail>(
      `/api/v1/tools/${toolName}`,
      { params: { namespace } },
    );
    return response;
  },

  async delete(namespace: string, identifier: string): Promise<void> {
    await apiClient.delete(`/api/v1/tools/${identifier}`, {
      params: { namespace },
    });

    trackEvent({
      name: 'tool_deleted',
      properties: {
        toolName: identifier,
      },
    });
  },

  // Create a new tool
  async create(
    namespace: string,
    tool: ToolSpecInput & {
      name: string;
      annotations?: Record<string, string>;
    },
  ): Promise<void> {
    const { name, type, annotations } = tool;
    const payload = {
      name,
      namespace,
      annotations,
      spec: buildToolSpec(tool),
    };
    await apiClient.post(`/api/v1/tools`, payload, {
      params: { namespace },
    });

    trackEvent({
      name: 'tool_created',
      properties: {
        toolName: name,
        toolType: type,
      },
    });
  },
};
