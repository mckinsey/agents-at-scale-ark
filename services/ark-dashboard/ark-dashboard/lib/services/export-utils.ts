/**
 * Shared utilities for export services
 * Contains common mapping logic used by both client and server export services
 */

import type {
  AgentListResponse,
  ModelListResponse,
  TeamListResponse,
  QueryListResponse,
  MCPServerListResponse,
  A2AServerListResponse,
  ResourceExportData,
  ExportItem,
} from '@/lib/services/export';

/**
 * Maps API response items to ExportItem format
 */
function mapToExportItems(
  items: Array<{ name?: string }> | undefined,
  type: string,
): ExportItem[] {
  if (!items) return [];

  return items.map(item => ({
    id: item.name || '',
    name: item.name || '',
    type,
  }));
}

/**
 * Processes Promise.allSettled results and maps them to ResourceExportData
 */
export function processResourceResponses(
  results: PromiseSettledResult<any>[],
  includeWorkflows: boolean = false,
): ResourceExportData {
  const [
    agents,
    teams,
    models,
    queries,
    a2aServers,
    mcpServers,
    workflowTemplates,
  ] = results;

  const data: ResourceExportData = {};

  // Process agents
  if (agents.status === 'fulfilled' && agents.value?.items) {
    data.agents = mapToExportItems(agents.value.items, 'agent');
  }

  // Process teams
  if (teams.status === 'fulfilled' && teams.value?.items) {
    data.teams = mapToExportItems(teams.value.items, 'team');
  }

  // Process models
  if (models.status === 'fulfilled' && models.value?.items) {
    data.models = mapToExportItems(models.value.items, 'model');
  }

  // Process queries
  if (queries.status === 'fulfilled' && queries.value?.items) {
    data.queries = mapToExportItems(queries.value.items, 'query');
  }

  // Process A2A servers
  if (a2aServers.status === 'fulfilled' && a2aServers.value?.items) {
    data.a2a = mapToExportItems(a2aServers.value.items, 'a2a');
  }

  // Process MCP servers
  if (mcpServers.status === 'fulfilled' && mcpServers.value?.items) {
    data.mcpservers = mapToExportItems(mcpServers.value.items, 'mcpservers');
  }

  // Process workflow templates if included (only in client-side export)
  if (includeWorkflows && workflowTemplates) {
    if (workflowTemplates.status === 'fulfilled' && workflowTemplates.value) {
      // Workflow templates have a different structure
      data.workflows = workflowTemplates.value.map((template: any) => ({
        id: template.metadata.name || '',
        name: template.metadata.name || '',
        type: 'workflow',
      }));
    }
  }

  return data;
}

/**
 * Logs failed resource fetches for debugging
 */
export function logFailedFetches(
  results: PromiseSettledResult<any>[],
  labels: string[],
): string[] {
  const failedFetches: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'rejected' && labels[index]) {
      failedFetches.push(`${labels[index]}: ${result.reason}`);
    }
  });

  if (failedFetches.length > 0) {
    console.error('Some resource fetches failed:', failedFetches);
  }

  return failedFetches;
}

/**
 * Creates a summary of fetched resources
 */
export function createResourceSummary(data: ResourceExportData): Record<string, number> {
  return {
    agents: data.agents?.length || 0,
    teams: data.teams?.length || 0,
    models: data.models?.length || 0,
    queries: data.queries?.length || 0,
    a2a: data.a2a?.length || 0,
    mcpservers: data.mcpservers?.length || 0,
    workflows: data.workflows?.length || 0,
  };
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Generates export filename with timestamp
 */
export function generateExportFilename(prefix: string = 'ark-export'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.zip`;
}