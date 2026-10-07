/**
 * Server-side export service for fetching resources
 * This service uses the server API client to make direct backend calls
 */
import type { NextRequest } from 'next/server';

import { fetchAllPages } from '@/lib/api/pagination';
import { serverApiClient } from '@/lib/api/server-client';
import { getArkApiAuthHeaders } from '@/lib/auth/server-auth-headers';
import type {
  A2AServerResponse,
  AgentResponse,
  MCPServerResponse,
  ModelResponse,
  QueryListResponse,
  ResourceExportData,
  TeamResponse,
} from '@/lib/services/export';
import {
  createResourceSummary,
  logFailedFetches,
  processResourceResponses,
} from '@/lib/services/export-utils';

export const exportServiceServer = {
  // Fetch all resources for export selection (server-side version)
  async fetchAllResources(request: NextRequest): Promise<ResourceExportData> {
    const backendUrl = `${process.env.ARK_API_SERVICE_PROTOCOL || 'http'}://${process.env.ARK_API_SERVICE_HOST || 'localhost'}:${process.env.ARK_API_SERVICE_PORT || '8000'}`;
    console.log(
      `Server-side export service: fetching resources directly from backend at ${backendUrl}`,
    );

    const headers = await getArkApiAuthHeaders(request);

    const results = await Promise.allSettled([
      fetchAllPages<AgentResponse>(
        '/v1/agents',
        {},
        serverApiClient,
        headers,
      ).then(items => ({ items })),
      fetchAllPages<TeamResponse>(
        '/v1/teams',
        {},
        serverApiClient,
        headers,
      ).then(items => ({ items })),
      fetchAllPages<ModelResponse>(
        '/v1/models',
        {},
        serverApiClient,
        headers,
      ).then(items => ({ items })),
      serverApiClient.get<QueryListResponse>('/v1/queries', { headers }),
      fetchAllPages<A2AServerResponse>(
        '/v1/a2a-servers',
        {},
        serverApiClient,
        headers,
      ).then(items => ({ items })),
      fetchAllPages<MCPServerResponse>(
        '/v1/mcp-servers',
        {},
        serverApiClient,
        headers,
      ).then(items => ({ items })),
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
