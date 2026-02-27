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
  EvaluatorListResponse,
  A2AServerListResponse,
  EvaluationListResponse,
  ResourceExportData,
} from '@/lib/services/export';

export const exportServiceServer = {
  // Fetch all resources for export selection (server-side version)
  async fetchAllResources(): Promise<ResourceExportData> {
    const backendUrl = `${process.env.ARK_API_SERVICE_PROTOCOL || 'http'}://${process.env.ARK_API_SERVICE_HOST || 'localhost'}:${process.env.ARK_API_SERVICE_PORT || '8000'}`;
    console.log(`Server-side export service: fetching resources directly from backend at ${backendUrl}`);

    const [
      agents,
      teams,
      models,
      queries,
      a2aServers,
      mcpServers,
      evaluators,
      evaluations,
    ] = await Promise.allSettled([
      serverApiClient.get<AgentListResponse>('/v1/agents'),
      serverApiClient.get<TeamListResponse>('/v1/teams'),
      serverApiClient.get<ModelListResponse>('/v1/models'),
      serverApiClient.get<QueryListResponse>('/v1/queries'),
      serverApiClient.get<A2AServerListResponse>('/v1/a2a-servers'),
      serverApiClient.get<MCPServerListResponse>('/v1/mcp-servers'),
      serverApiClient.get<EvaluatorListResponse>('/v1/evaluators'),
      serverApiClient.get<EvaluationListResponse>('/v1/evaluations'),
      // Note: WorkflowTemplates would need similar handling
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

    if (evaluations.status === 'fulfilled' && evaluations.value?.items) {
      data.evaluations = evaluations.value.items.map(evaluation => ({
        id: evaluation.name || '',
        name: evaluation.name || '',
        type: 'evaluation',
      }));
    }

    // Log what we found and any failures
    const summary = {
      agents: data.agents?.length || 0,
      teams: data.teams?.length || 0,
      models: data.models?.length || 0,
      queries: data.queries?.length || 0,
      a2a: data.a2a?.length || 0,
      mcpservers: data.mcpservers?.length || 0,
      evaluators: data.evaluators?.length || 0,
      evaluations: data.evaluations?.length || 0,
    };

    // Log any failed fetches for debugging
    const failedFetches: string[] = [];
    if (agents.status === 'rejected') failedFetches.push(`agents: ${agents.reason}`);
    if (teams.status === 'rejected') failedFetches.push(`teams: ${teams.reason}`);
    if (models.status === 'rejected') failedFetches.push(`models: ${models.reason}`);
    if (queries.status === 'rejected') failedFetches.push(`queries: ${queries.reason}`);
    if (a2aServers.status === 'rejected') failedFetches.push(`a2aServers: ${a2aServers.reason}`);
    if (mcpServers.status === 'rejected') failedFetches.push(`mcpServers: ${mcpServers.reason}`);
    if (evaluators.status === 'rejected') failedFetches.push(`evaluators: ${evaluators.reason}`);
    if (evaluations.status === 'rejected') failedFetches.push(`evaluations: ${evaluations.reason}`);

    if (failedFetches.length > 0) {
      console.error('Some resource fetches failed:', failedFetches);
    }

    console.log('Server-side resource fetch complete:', summary);

    return data;
  },
};