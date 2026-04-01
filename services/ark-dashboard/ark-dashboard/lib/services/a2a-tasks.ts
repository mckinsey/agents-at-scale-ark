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
  async getAll(): Promise<A2ATask[]> {
    const response =
      await apiClient.get<A2ATaskListResponse>('/api/v1/a2a-tasks');

    return response.items.map(item => ({
      ...item,
      id: item.name,
    })) as A2ATask[];
  },
  async get(id: string): Promise<A2ATaskDetailResponse> {
    const response = await apiClient.get<A2ATaskDetailResponse>(
      `/api/v1/a2a-tasks/${id}`,
    );
    return {
      ...response,
      id: response.name,
    } as A2ATaskDetailResponse;
  },
};
