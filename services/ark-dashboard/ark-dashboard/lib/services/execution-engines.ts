import { apiClient } from '@/lib/api/client';
import type {
  ExecutionEngine,
  ExecutionEngineDetail,
  ExecutionEngineList,
} from '@/lib/types/execution-engine';

const BASE_PATH = '/api/v1/execution-engines';

async function getAll(isAgentic?: boolean): Promise<ExecutionEngine[]> {
  const params: Record<string, string> = {};
  if (isAgentic !== undefined) {
    params.is_agentic = String(isAgentic);
  }

  const data = await apiClient.get<ExecutionEngineList>(BASE_PATH, { params });
  return data.items;
}

async function getAgenticEngines(): Promise<ExecutionEngine[]> {
  return getAll(true);
}

async function getById(name: string): Promise<ExecutionEngineDetail> {
  return apiClient.get<ExecutionEngineDetail>(
    `${BASE_PATH}/${encodeURIComponent(name)}`,
  );
}

export const executionEnginesService = {
  getAll,
  getAgenticEngines,
  getById,
};
