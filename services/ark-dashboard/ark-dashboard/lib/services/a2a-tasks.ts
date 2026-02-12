import type {
  A2ATaskDetailResponse,
  A2ATaskListResponse,
} from '@/lib/api/a2a-tasks-types';
import { apiClient } from '@/lib/api/client';

export enum A2ATaskPhase {
  COMPLETED = 'completed',
  RUNNING = 'running',
  FAILED = 'failed',
  PENDING = 'pending',
  UNKNOWN = 'unknown',
  ASSIGNED = 'assigned',
  INPUT_REQUIRED = 'input-required',
  AUTH_REQUIRED = 'auth-required',
  CANCELLED = 'cancelled',
}

export type A2ATask = A2ATaskDetailResponse & {
  id: string;
  phase?: A2ATaskPhase;
  creationTimestamp?: string;
};

export const a2aTasksService = {
  async getAll(namespace?: string): Promise<A2ATask[]> {
    const params = namespace ? { namespace } : undefined;
    const response = await apiClient.get<A2ATaskListResponse>(
      '/api/v1/a2a-tasks',
      params ? { params } : undefined,
    );

    return response.items.map(item => ({
      ...item,
      id: item.name,
    })) as A2ATask[];
  },
  async get(id: string, namespace?: string): Promise<A2ATaskDetailResponse> {
    const params = namespace ? { namespace } : undefined;
    const response = await apiClient.get<A2ATaskDetailResponse>(
      `/api/v1/a2a-tasks/${id}`,
      params ? { params } : undefined,
    );
    return {
      ...response,
      id: response.name,
    } as A2ATaskDetailResponse;
  },
};
