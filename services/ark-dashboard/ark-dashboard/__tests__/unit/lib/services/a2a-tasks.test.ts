import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { A2ATaskListResponse } from '@/lib/api/a2a-tasks-types';
import { apiClient } from '@/lib/api/client';
import { a2aTasksService } from '@/lib/services/a2a-tasks';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('a2aTasksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should fetch all tasks and add id field from list response', async () => {
      const mockListResponse: A2ATaskListResponse = {
        items: [
          {
            name: 'task-1',
            namespace: 'default',
            taskId: '123',
            phase: 'completed',
            agentRef: { name: 'agent-1' },
            queryRef: { name: 'query-1' },
            creationTimestamp: '2023-01-01T00:00:00Z',
          },
          {
            name: 'task-2',
            namespace: 'default',
            taskId: '456',
            phase: 'running',
            agentRef: { name: 'agent-2' },
            queryRef: { name: 'query-2' },
            creationTimestamp: '2023-01-02T00:00:00Z',
          },
        ],
        count: 2,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await a2aTasksService.getAll();

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/a2a-tasks');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'task-1',
        name: 'task-1',
        phase: 'completed',
        taskId: '123',
        agentRef: { name: 'agent-1' },
        queryRef: { name: 'query-1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
      });
      expect(result[1]).toMatchObject({
        id: 'task-2',
        name: 'task-2',
        phase: 'running',
        taskId: '456',
        agentRef: { name: 'agent-2' },
        queryRef: { name: 'query-2' },
        creationTimestamp: '2023-01-02T00:00:00Z',
      });
    });
  });

  describe('get', () => {
    it('should fetch a single task by id', async () => {
      const mockTask = {
        name: 'task-1',
        namespace: 'default',
        taskId: '123',
        phase: 'completed',
        agentRef: { name: 'agent-1' },
        queryRef: { name: 'query-1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
        a2aServerRef: { name: 'server-1' },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTask);

      const result = await a2aTasksService.get('task-1');

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/a2a-tasks/task-1');

      expect(result).toMatchObject({
        id: 'task-1',
        name: 'task-1',
        phase: 'completed',
        taskId: '123',
        agentRef: { name: 'agent-1' },
        queryRef: { name: 'query-1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
      });
    });
  });
});
