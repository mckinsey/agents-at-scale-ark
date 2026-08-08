import { apiClient } from '@/lib/api/client';
import { apiUrl } from '@/lib/api/config';
import type { components } from '@/lib/api/generated/types';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import {
  processResourceResponses,
  downloadBlob,
  generateExportFilename,
} from '@/lib/services/export-utils';

// Resource types from the API
export type AgentListResponse = components['schemas']['AgentListResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type TeamListResponse = components['schemas']['TeamListResponse'];
export type QueryListResponse = components['schemas']['QueryListResponse'];
export type MCPServerListResponse =
  components['schemas']['MCPServerListResponse'];
export type A2AServerListResponse =
  components['schemas']['A2AServerListResponse'];

// Export configuration types
export interface ExportConfig {
  agents?: boolean;
  teams?: boolean;
  models?: boolean;
  queries?: boolean;
  a2a?: boolean;
  mcp?: boolean;
  workflows?: boolean;
}

export interface ExportItem {
  id: string;
  name: string;
  type: string;
  description?: string;
  selected?: boolean;
}

export interface ResourceExportData {
  agents?: ExportItem[];
  teams?: ExportItem[];
  models?: ExportItem[];
  queries?: ExportItem[];
  a2a?: ExportItem[];
  mcpservers?: ExportItem[];
  workflows?: ExportItem[];
}

export type ResourceType =
  | 'agents'
  | 'teams'
  | 'models'
  | 'queries'
  | 'a2a'
  | 'mcpservers'
  | 'workflows'
;

// Export request/response types
export interface ExportRequest {
  resource_types: ResourceType[];
  resource_ids?: Record<string, string[]>;
  namespace?: string;
}

export interface ExportHistoryResponse {
  last_export: string | null;
  export_count: number;
}

// Export service
export const exportService = {
  // Get last export timestamp from backend
  async getLastExportTime(namespace: string): Promise<string | null> {
    try {
      const response = await apiClient.get<ExportHistoryResponse>(
        '/api/v1/export/last-export-time',
        { params: { namespace } },
      );
      return response.last_export;
    } catch (error) {
      console.error('Failed to get last export time:', error);
      return null;
    }
  },

  // Fetch all resources for export selection
  async fetchAllResources(namespace: string): Promise<ResourceExportData> {
    const params = { namespace };
    const results = await Promise.allSettled([
      apiClient.get<AgentListResponse>('/api/v1/agents', { params }),
      apiClient.get<TeamListResponse>('/api/v1/teams', { params }),
      apiClient.get<ModelListResponse>('/api/v1/models', { params }),
      apiClient.get<QueryListResponse>('/api/v1/queries', { params }),
      apiClient.get<A2AServerListResponse>('/api/v1/a2a-servers', { params }),
      apiClient.get<MCPServerListResponse>('/api/v1/mcp-servers', { params }),
      workflowTemplatesService.list(namespace),
    ]);

    return processResourceResponses(results, true);
  },

  // Export selected resources using new backend endpoint
  async exportResources(
    namespace: string,
    selectedItems: ResourceExportData,
  ): Promise<void> {
    // Build request for backend
    const resourceTypes: ResourceType[] = [];
    const resourceIds: Record<string, string[]> = {};

    // Collect selected resources
    for (const [type, items] of Object.entries(selectedItems)) {
      if (items && Array.isArray(items)) {
        const selected = items.filter(item => item.selected);
        if (selected.length > 0) {
          resourceTypes.push(type as ResourceType);
          resourceIds[type] = selected.map(item => item.id);
        }
      }
    }

    if (resourceTypes.length === 0) {
      throw new Error('No resources selected for export');
    }

    // Call backend export endpoint using fetch directly for blob response
    const response = await fetch(
      apiUrl('/api/v1/export/resources'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resource_types: resourceTypes,
          resource_ids: resourceIds,
          namespace,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    downloadBlob(blob, generateExportFilename('ark-export'));
  },

  // Export all resources using the unified export endpoint
  async exportAll(namespace: string): Promise<void> {
    // Call backend export endpoint without resource_types to export all
    const response = await fetch(apiUrl('/api/v1/export/resources'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ namespace }),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    downloadBlob(blob, generateExportFilename('ark-export-all'));
  },
};
