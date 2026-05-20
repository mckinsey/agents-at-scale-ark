import { describe, it, expect, beforeEach, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';

import {
  getApprovalDetails,
  submitApproval,
  type ApprovalDetails,
} from './query-approvals';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('query-approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApprovalDetails', () => {
    it('calls apiClient.get with correct endpoint and namespace', async () => {
      const mockApprovalDetails: ApprovalDetails = {
        taskId: 'task-123',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'write-file',
              arguments: '{}',
            },
          },
        ],
        timeout: '5m',
        onTimeout: 'reject',
        agentName: 'test-agent',
        phase: 'input-required',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockApprovalDetails);

      const result = await getApprovalDetails('test-query', 'default');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/queries/test-query/approval',
        { params: { namespace: 'default' } },
      );
      expect(result).toEqual(mockApprovalDetails);
    });

    it('passes namespace parameter correctly', async () => {
      const mockApprovalDetails: ApprovalDetails = {
        taskId: 'task-456',
        toolCalls: [],
        phase: 'input-required',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockApprovalDetails);

      await getApprovalDetails('my-query', 'custom-namespace');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/queries/my-query/approval',
        { params: { namespace: 'custom-namespace' } },
      );
    });
  });

  describe('submitApproval', () => {
    it('calls apiClient.post with approval action', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'approved' as const,
        taskId: 'task-123',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await submitApproval('test-query', 'default', 'approved');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/test-query/approval?namespace=default',
        { action: 'approved' },
      );
      expect(result).toEqual(mockResponse);
    });

    it('calls apiClient.post with rejection action', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'rejected' as const,
        taskId: 'task-123',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await submitApproval('test-query', 'default', 'rejected');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/test-query/approval?namespace=default',
        { action: 'rejected' },
      );
      expect(result).toEqual(mockResponse);
    });

    it('includes namespace parameter in URL', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'my-query',
        queryNamespace: 'custom-namespace',
        action: 'approved' as const,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      await submitApproval('my-query', 'custom-namespace', 'approved');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/my-query/approval?namespace=custom-namespace',
        { action: 'approved' },
      );
    });

    it('handles success response', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'approved' as const,
        taskId: 'task-789',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await submitApproval('test-query', 'default', 'approved');

      expect(result.status).toBe('success');
      expect(result.action).toBe('approved');
      expect(result.taskId).toBe('task-789');
    });

    it('propagates error response', async () => {
      const mockError = new Error('API error');
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      await expect(
        submitApproval('test-query', 'default', 'approved'),
      ).rejects.toThrow('API error');

      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });
  });
});
