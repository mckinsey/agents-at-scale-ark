/**
 * Server-side export service for fetching resources
 * This service uses the server API client to make direct backend calls
 */

import { serverApiClient } from '@/lib/api/server-client';
import type {
  AgentListResponse,
  ModelListResponse,
  TeamListResponse,
  QueryListResponse,
  MCPServerListResponse,
  A2AServerListResponse,
  ResourceExportData,
} from '@/lib/services/export';
import {
  processResourceResponses,
  logFailedFetches,
  createResourceSummary,
} from '@/lib/services/export-utils';

export const exportServiceServer = {
  // Fetch all resources for export selection (server-side version)
  async fetchAllResources(): Promise<ResourceExportData> {
    const backendUrl = `${process.env.ARK_API_SERVICE_PROTOCOL || 'http'}://${process.env.ARK_API_SERVICE_HOST || 'localhost'}:${process.env.ARK_API_SERVICE_PORT || '8000'}`;
    console.log(`Server-side export service: fetching resources directly from backend at ${backendUrl}`);

    const results = await Promise.allSettled([
      serverApiClient.get<AgentListResponse>('/v1/agents'),
      serverApiClient.get<TeamListResponse>('/v1/teams'),
      serverApiClient.get<ModelListResponse>('/v1/models'),
      serverApiClient.get<QueryListResponse>('/v1/queries'),
      serverApiClient.get<A2AServerListResponse>('/v1/a2a-servers'),
      serverApiClient.get<MCPServerListResponse>('/v1/mcp-servers'),
      null, // Placeholder for workflow templates to match the array structure
    ]);

    const data = processResourceResponses(results, false);

    // Log any failed fetches for debugging
    const labels = [
      'agents',
      'teams',
      'models',
      'queries',
      'a2aServers',
      'mcpServers',
      'workflowTemplates',
    ];
    logFailedFetches(results, labels);

    // Log summary of what we found
    const summary = createResourceSummary(data);
    console.log('Server-side resource fetch complete:', summary);

    return data;
  },
};