import { apiClient } from '@/lib/api/client';
import { API_CONFIG } from '@/lib/api/config';
import type { components } from '@/lib/api/generated/types';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

// Resource types from the API
export type AgentListResponse = components['schemas']['AgentListResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type TeamListResponse = components['schemas']['TeamListResponse'];
export type QueryListResponse = components['schemas']['QueryListResponse'];
export type MCPServerListResponse =
  components['schemas']['MCPServerListResponse'];
export type EvaluatorListResponse =
  components['schemas']['EvaluatorListResponse'];
export type A2AServerListResponse =
  components['schemas']['A2AServerListResponse'];
// Note: WorkflowTemplateListResponse doesn't exist in current API
export type EvaluationListResponse =
  components['schemas']['EvaluationListResponse'];

// Export configuration types
export interface ExportConfig {
  agents?: boolean;
  teams?: boolean;
  models?: boolean;
  queries?: boolean;
  a2a?: boolean;
  mcp?: boolean;
  workflows?: boolean;
  evaluators?: boolean;
  evaluations?: boolean;
}

export interface ExportItem {
  id: string;
  name: string;
  type: string;
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
  evaluators?: ExportItem[];
  evaluations?: ExportItem[];
}

export type ResourceType =
  | 'agents'
  | 'teams'
  | 'models'
  | 'queries'
  | 'a2a'
  | 'mcpservers'
  | 'workflows'
  | 'evaluators'
  | 'evaluations';

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
  async getLastExportTime(): Promise<string | null> {
    try {
      const response = await apiClient.get<ExportHistoryResponse>(
        '/api/v1/export/last-export-time',
      );
      return response.last_export;
    } catch (error) {
      console.error('Failed to get last export time:', error);
      return null;
    }
  },

  // Fetch all resources for export selection
  async fetchAllResources(): Promise<ResourceExportData> {
    const [
      agents,
      teams,
      models,
      queries,
      a2aServers,
      mcpServers,
      evaluators,
      evaluations,
      workflowTemplates,
    ] = await Promise.allSettled([
      apiClient.get<AgentListResponse>('/api/v1/agents'),
      apiClient.get<TeamListResponse>('/api/v1/teams'),
      apiClient.get<ModelListResponse>('/api/v1/models'),
      apiClient.get<QueryListResponse>('/api/v1/queries'),
      apiClient.get<A2AServerListResponse>('/api/v1/a2a-servers'),
      apiClient.get<MCPServerListResponse>('/api/v1/mcp-servers'),
      apiClient.get<EvaluatorListResponse>('/api/v1/evaluators'),
      apiClient.get<EvaluationListResponse>('/api/v1/evaluations'),
      workflowTemplatesService.list(),
    ]);

    const data: ResourceExportData = {};

    if (agents.status === 'fulfilled' && agents.value?.items) {
      data.agents = agents.value.items.map(agent => ({
        id: agent.name || '',
        name: agent.name || '',
        type: 'agent',
      }));
    }

    if (teams.status === 'fulfilled' && teams.value?.items) {
      data.teams = teams.value.items.map(team => ({
        id: team.name || '',
        name: team.name || '',
        type: 'team',
      }));
    }

    if (models.status === 'fulfilled' && models.value?.items) {
      data.models = models.value.items.map(model => ({
        id: model.name || '',
        name: model.name || '',
        type: 'model',
      }));
    }

    if (queries.status === 'fulfilled' && queries.value?.items) {
      data.queries = queries.value.items.map(query => ({
        id: query.name || '',
        name: query.name || '',
        type: 'query',
      }));
    }

    if (a2aServers.status === 'fulfilled' && a2aServers.value?.items) {
      data.a2a = a2aServers.value.items.map(server => ({
        id: server.name || '',
        name: server.name || '',
        type: 'a2a',
      }));
    }

    if (mcpServers.status === 'fulfilled' && mcpServers.value?.items) {
      data.mcpservers = mcpServers.value.items.map(server => ({
        id: server.name || '',
        name: server.name || '',
        type: 'mcpservers',
      }));
    }

    if (evaluators.status === 'fulfilled' && evaluators.value?.items) {
      data.evaluators = evaluators.value.items.map(evaluator => ({
        id: evaluator.name || '',
        name: evaluator.name || '',
        type: 'evaluator',
      }));
    }

    // Fetch WorkflowTemplates
    if (workflowTemplates.status === 'fulfilled' && workflowTemplates.value) {
      data.workflows = workflowTemplates.value.map(template => ({
        id: template.metadata.name || '',
        name: template.metadata.name || '',
        type: 'workflow',
      }));
    }

    if (evaluations.status === 'fulfilled' && evaluations.value?.items) {
      data.evaluations = evaluations.value.items.map(evaluation => ({
        id: evaluation.name || '',
        name: evaluation.name || '',
        type: 'evaluation',
      }));
    }

    return data;
  },

  // Export selected resources using new backend endpoint
  async exportResources(selectedItems: ResourceExportData): Promise<void> {
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
      `${API_CONFIG.baseURL}/api/v1/export/resources`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resource_types: resourceTypes,
          resource_ids: resourceIds,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Download the file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ark-export-${timestamp}.zip`;

    // Create a download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Export all resources using the unified export endpoint
  async exportAll(): Promise<void> {
    // Call backend export endpoint without resource_types to export all
    const response = await fetch(`${API_CONFIG.baseURL}/api/v1/export/resources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Download the file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ark-export-all-${timestamp}.zip`;

    // Create a download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
