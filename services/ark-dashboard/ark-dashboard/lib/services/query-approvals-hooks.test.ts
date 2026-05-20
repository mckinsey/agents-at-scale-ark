import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as queryApprovalsService from './query-approvals';
import {
  useGetApprovalDetails,
  useSubmitApproval,
} from './query-approvals-hooks';

vi.mock('./query-approvals');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('query-approvals-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('useGetApprovalDetails', () => {
    it('returns query result with approval details', async () => {
      const mockApprovalDetails = {
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

      vi.mocked(queryApprovalsService.getApprovalDetails).mockResolvedValueOnce(
        mockApprovalDetails,
      );

      const { result } = renderHook(
        () => useGetApprovalDetails('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockApprovalDetails);
      expect(queryApprovalsService.getApprovalDetails).toHaveBeenCalledWith(
        'test-query',
        'default',
      );
    });

    it('handles loading state', () => {
      vi.mocked(
        queryApprovalsService.getApprovalDetails,
      ).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const { result } = renderHook(
        () => useGetApprovalDetails('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it.skip('handles error state', async () => {
      const mockError = new Error('API error');
      vi.mocked(queryApprovalsService.getApprovalDetails).mockRejectedValueOnce(
        mockError,
      );

      const { result } = renderHook(
        () => useGetApprovalDetails('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useGetApprovalDetails('test-query', 'default', false),
        { wrapper: createWrapper() },
      );

      expect(result.current.isPending).toBe(true);
      expect(queryApprovalsService.getApprovalDetails).not.toHaveBeenCalled();
    });

    it('uses correct query key with namespace and query name', async () => {
      const mockApprovalDetails = {
        taskId: 'task-456',
        toolCalls: [],
        phase: 'input-required',
      };

      vi.mocked(queryApprovalsService.getApprovalDetails).mockResolvedValueOnce(
        mockApprovalDetails,
      );

      const queryClient = new QueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children,
        );

      renderHook(() => useGetApprovalDetails('my-query', 'custom-ns'), {
        wrapper,
      });

      await waitFor(() => {
        const cachedData = queryClient.getQueryData([
          'approval-details',
          'custom-ns',
          'my-query',
        ]);
        expect(cachedData).toEqual(mockApprovalDetails);
      });
    });
  });

  describe('useSubmitApproval', () => {
    it('returns mutation function', () => {
      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      expect(result.current.mutate).toBeDefined();
      expect(result.current.mutateAsync).toBeDefined();
    });

    it('triggers API call on mutate with approve action', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'approved' as const,
        taskId: 'task-123',
      };

      vi.mocked(queryApprovalsService.submitApproval).mockResolvedValueOnce(
        mockResponse,
      );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      result.current.mutate('approved');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(queryApprovalsService.submitApproval).toHaveBeenCalledWith(
        'test-query',
        'default',
        'approved',
      );
    });

    it('triggers API call on mutate with reject action', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'rejected' as const,
        taskId: 'task-123',
      };

      vi.mocked(queryApprovalsService.submitApproval).mockResolvedValueOnce(
        mockResponse,
      );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      result.current.mutate('rejected');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(queryApprovalsService.submitApproval).toHaveBeenCalledWith(
        'test-query',
        'default',
        'rejected',
      );
    });

    it('handles loading state during mutation', async () => {
      vi.mocked(queryApprovalsService.submitApproval).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      result.current.mutate('approved');

      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });
    });

    it('handles success state', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'approved' as const,
        taskId: 'task-789',
      };

      vi.mocked(queryApprovalsService.submitApproval).mockResolvedValueOnce(
        mockResponse,
      );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      result.current.mutate('approved');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
    });

    it('handles error state', async () => {
      const mockError = new Error('API error');
      vi.mocked(queryApprovalsService.submitApproval).mockRejectedValueOnce(
        mockError,
      );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper: createWrapper() },
      );

      result.current.mutate('approved');

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
    });

    it('invalidates related queries on success', async () => {
      const mockResponse = {
        status: 'success',
        queryName: 'test-query',
        queryNamespace: 'default',
        action: 'approved' as const,
      };

      vi.mocked(queryApprovalsService.submitApproval).mockResolvedValueOnce(
        mockResponse,
      );

      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          children,
        );

      const { result } = renderHook(
        () => useSubmitApproval('test-query', 'default'),
        { wrapper },
      );

      result.current.mutate('approved');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['approval-details', 'default', 'test-query'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['queries', 'default', 'test-query'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['conversations', 'test-query'],
      });
    });
  });
});
