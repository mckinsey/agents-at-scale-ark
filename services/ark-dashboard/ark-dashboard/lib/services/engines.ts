// TODO: When execution engines graduate from experimental, promote to dedicated
// API endpoints (like /api/v1/models) with generated types instead of manual types
// and the generic resource API.

import { apiClient } from '@/lib/api/client';

interface ExecutionEngineK8sResource {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    description?: string;
  };
  status: {
    phase?: string;
    lastResolvedAddress?: string;
    message?: string;
  };
}

interface ExecutionEngineK8sListResponse {
  items: ExecutionEngineK8sResource[];
}

export type ExecutionEnginePhase = 'ready' | 'running' | 'error';

export interface ExecutionEngine {
  name: string;
  namespace: string;
  description?: string;
  phase: ExecutionEnginePhase;
  resolvedAddress?: string;
  statusMessage?: string;
}

const RESOURCE_PATH =
  '/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine';

function toExecutionEngine(resource: ExecutionEngineK8sResource): ExecutionEngine {
  return {
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    description: resource.spec.description,
    phase: (resource.status.phase as ExecutionEnginePhase) || 'running',
    resolvedAddress: resource.status.lastResolvedAddress,
    statusMessage: resource.status.message,
  };
}

export const executionEnginesService = {
  async getAll(): Promise<ExecutionEngine[]> {
    const response =
      await apiClient.get<ExecutionEngineK8sListResponse>(RESOURCE_PATH);
    return response.items.map(toExecutionEngine);
  },

  async getByName(name: string): Promise<ExecutionEngine | null> {
    try {
      const response = await apiClient.get<ExecutionEngineK8sResource>(
        `${RESOURCE_PATH}/${name}`,
      );
      return toExecutionEngine(response);
    } catch {
      return null;
    }
  },

  async delete(name: string): Promise<boolean> {
    try {
      await apiClient.delete(`${RESOURCE_PATH}/${name}`);
      return true;
    } catch {
      return false;
    }
  },
};
