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
  // Inline language for the list badge; the list never carries script source.
  language?: string;
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
    inline?: { source?: string; language?: string };
    [key: string]: unknown;
    type: string;
  };
  status?: Record<string, unknown>;
}

/**
 * Mirrors the Tool controller's Available condition. A resolvedAddress is only
 * usable when Available is True for the current generation, so the reason is
 * what the UI branches on: a policy conflict is an administrator's problem, a
 * missing runtime is the platform team's.
 */
export interface ToolStatusSummary {
  available?: boolean;
  reason?: string;
  message?: string;
  state?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

export function summarizeToolStatus(
  status: ToolDetail['status'],
): ToolStatusSummary {
  if (!isRecord(status)) return {};

  const summary: ToolStatusSummary = { state: readString(status, 'state') };
  const conditions = status.conditions;
  if (!Array.isArray(conditions)) return summary;

  for (const condition of conditions) {
    if (!isRecord(condition)) continue;
    if (readString(condition, 'type') !== 'Available') continue;
    summary.available = readString(condition, 'status') === 'True';
    summary.reason = readString(condition, 'reason');
    summary.message = readString(condition, 'message');
  }

  return summary;
}

// The reason drives the message, so an operator can tell "nobody installed the
// runtime" from "your namespace's network policy is too wide".
export const TOOL_PENDING_MESSAGES: Record<string, string> = {
  RuntimeNotInstalled:
    'Not executable yet: the inline tool runtime is not installed in this cluster.',
  ConflictingNetworkPolicy:
    'Not executable: a NetworkPolicy in this namespace is too permissive for the runner. An administrator must narrow it.',
  ActivatorUnavailable:
    'Not executable: the inline tool activator has no available replica.',
  ProvisioningFailed: 'Not executable: provisioning the runner failed.',
};

// Fields shared by tool create and update used to build the tool spec
interface ToolSpecInput {
  type: string;
  description: string;
  inputSchema?: Record<string, unknown> | string;
  url?: string;
  agent?: string;
  team?: string;
  inlineSource?: string;
  inlineLanguage?: string;
}

// Build a Tool CR spec from form-level fields, parsing the input schema
function buildToolSpec({
  type,
  description,
  inputSchema,
  url,
  agent,
  team,
  inlineSource,
  inlineLanguage,
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
    // Source is sent exactly as authored: no trimming, since whitespace is
    // significant in a script.
    ...(type === 'inline' && inlineSource !== undefined && inlineLanguage
      ? { inline: { source: inlineSource, language: inlineLanguage } }
      : {}),
  };
}

// Service for tool operations
export const toolsService = {
  // Get all tools in a namespace
  async getAll(namespace: string): Promise<Tool[]> {
    const items = await fetchAllPages<Omit<Tool, 'id'>>(`/api/v1/tools`, {
      namespace,
    });
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

  // Update an existing tool. The typed PUT replaces spec wholesale, so the spec
  // built here must carry every block the tool should keep.
  async update(
    namespace: string,
    name: string,
    tool: ToolSpecInput & { annotations?: Record<string, string> },
  ): Promise<void> {
    await apiClient.put(
      `/api/v1/tools/${name}`,
      { annotations: tool.annotations, spec: buildToolSpec(tool) },
      { params: { namespace } },
    );

    trackEvent({
      name: 'tool_updated',
      properties: {
        toolName: name,
        toolType: tool.type,
      },
    });
  },
};
