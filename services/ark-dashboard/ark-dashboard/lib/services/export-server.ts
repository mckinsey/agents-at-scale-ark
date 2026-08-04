/**
 * Server-side export service for fetching resources
 * This service uses the server API client to make direct backend calls
 */

import { serverApiClient } from '@/lib/api/server-client';
import { fetchAllPages } from '@/lib/api/pagination';
import type {
  AgentResponse,
  ModelResponse,
  TeamResponse,
  MCPServerResponse,
  QueryListResponse,
  A2AServerResponse,
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
      fetchAllPages<AgentResponse>('/v1/agents', {}, serverApiClient).then(
        items => ({ items }),
      ),
      fetchAllPages<TeamResponse>('/v1/teams', {}, serverApiClient).then(
        items => ({ items }),
      ),
      fetchAllPages<ModelResponse>('/v1/models', {}, serverApiClient).then(
        items => ({ items }),
      ),
      serverApiClient.get<QueryListResponse>('/v1/queries'),
      fetchAllPages<A2AServerResponse>('/v1/a2a-servers', {}, serverApiClient).then(
        items => ({ items }),
      ),
      fetchAllPages<MCPServerResponse>('/v1/mcp-servers', {}, serverApiClient).then(
        items => ({ items }),
      ),
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