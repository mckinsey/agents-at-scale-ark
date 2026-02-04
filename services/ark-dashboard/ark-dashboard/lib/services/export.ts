import { saveAs } from 'file-saver';
import JSZip from 'jszip';

import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Resource types from the API
export type AgentListResponse = components['schemas']['AgentListResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type TeamListResponse = components['schemas']['TeamListResponse'];
export type QueryListResponse = components['schemas']['QueryListResponse'];
export type MCPServerListResponse =
  components['schemas']['MCPServerListResponse'];
export type EvaluatorListResponse =
  components['schemas']['EvaluatorListResponse'];
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
  mcp?: ExportItem[];
  workflows?: ExportItem[];
  evaluators?: ExportItem[];
  evaluations?: ExportItem[];
}

// Local storage keys for tracking exports
const LAST_EXPORT_KEY = 'ark-dashboard-last-export';

// Export service
export const exportService = {
  // Get last export timestamp
  getLastExportTime(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LAST_EXPORT_KEY);
  },

  // Update last export timestamp
  updateLastExportTime(): void {
    if (typeof window === 'undefined') return;
    const timestamp = new Date().toISOString();
    localStorage.setItem(LAST_EXPORT_KEY, timestamp);
  },

  // Fetch all resources for export selection
  async fetchAllResources(): Promise<ResourceExportData> {
    const [
      agents,
      teams,
      models,
      queries,
      mcpServers,
      evaluators,
      evaluations,
    ] = await Promise.allSettled([
      apiClient.get<AgentListResponse>('/api/v1/agents'),
      apiClient.get<TeamListResponse>('/api/v1/teams'),
      apiClient.get<ModelListResponse>('/api/v1/models'),
      apiClient.get<QueryListResponse>('/api/v1/queries'),
      apiClient.get<MCPServerListResponse>('/api/v1/mcp-servers'),
      apiClient.get<EvaluatorListResponse>('/api/v1/evaluators'),
      apiClient.get<EvaluationListResponse>('/api/v1/evaluations'),
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

    if (mcpServers.status === 'fulfilled' && mcpServers.value?.items) {
      data.mcp = mcpServers.value.items.map(server => ({
        id: server.name || '',
        name: server.name || '',
        type: 'mcp',
      }));
    }

    if (evaluators.status === 'fulfilled' && evaluators.value?.items) {
      data.evaluators = evaluators.value.items.map(evaluator => ({
        id: evaluator.name || '',
        name: evaluator.name || '',
        type: 'evaluator',
      }));
    }

    // Workflows are not currently available in the API
    data.workflows = [];

    if (evaluations.status === 'fulfilled' && evaluations.value?.items) {
      data.evaluations = evaluations.value.items.map(evaluation => ({
        id: evaluation.name || '',
        name: evaluation.name || '',
        type: 'evaluation',
      }));
    }

    return data;
  },

  // Export selected resources
  async exportResources(selectedItems: ResourceExportData): Promise<void> {
    const zip = new JSZip();
    const exportPromises: Promise<void>[] = [];

    // Helper function to fetch and add resource YAML to zip
    const addResourceToZip = async (
      type: string,
      folderName: string,
      items?: ExportItem[],
    ) => {
      if (!items || items.length === 0) return;

      const selected = items.filter(item => item.selected);
      if (selected.length === 0) return;

      const folder = zip.folder(folderName);
      if (!folder) return;

      for (const item of selected) {
        try {
          const yaml = await apiClient.get<string>(
            `/api/v1/${type}/${item.id}/export`,
            { headers: { Accept: 'text/yaml' } },
          );
          folder.file(`${item.name}.yaml`, yaml);
        } catch (error) {
          console.error(`Failed to export ${type} ${item.name}:`, error);
        }
      }
    };

    // Export each resource type
    if (selectedItems.agents) {
      exportPromises.push(
        addResourceToZip('agents', 'agents', selectedItems.agents),
      );
    }
    if (selectedItems.teams) {
      exportPromises.push(
        addResourceToZip('teams', 'teams', selectedItems.teams),
      );
    }
    if (selectedItems.models) {
      exportPromises.push(
        addResourceToZip('models', 'models', selectedItems.models),
      );
    }
    if (selectedItems.queries) {
      exportPromises.push(
        addResourceToZip('queries', 'queries', selectedItems.queries),
      );
    }
    if (selectedItems.a2a) {
      exportPromises.push(
        addResourceToZip('a2a-servers', 'a2a', selectedItems.a2a),
      );
    }
    if (selectedItems.mcp) {
      exportPromises.push(
        addResourceToZip('mcp-servers', 'mcp', selectedItems.mcp),
      );
    }
    if (selectedItems.evaluators) {
      exportPromises.push(
        addResourceToZip('evaluators', 'evaluators', selectedItems.evaluators),
      );
    }
    if (selectedItems.workflows) {
      exportPromises.push(
        addResourceToZip(
          'workflow-templates',
          'workflows',
          selectedItems.workflows,
        ),
      );
    }
    if (selectedItems.evaluations) {
      exportPromises.push(
        addResourceToZip(
          'evaluations',
          'evaluations',
          selectedItems.evaluations,
        ),
      );
    }

    await Promise.all(exportPromises);

    // Generate and download the zip file
    const blob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveAs(blob, `ark-export-${timestamp}.zip`);

    // Update last export time
    this.updateLastExportTime();
  },

  // Export all resources
  async exportAll(): Promise<void> {
    const resources = await this.fetchAllResources();

    // Mark all items as selected
    const selectedResources: ResourceExportData = {};
    for (const [key, items] of Object.entries(resources)) {
      if (items && Array.isArray(items)) {
        selectedResources[key as keyof ResourceExportData] = items.map(
          item => ({
            ...item,
            selected: true,
          }),
        );
      }
    }

    await this.exportResources(selectedResources);
  },
};
