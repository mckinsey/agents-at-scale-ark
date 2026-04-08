import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNamespace } from '@/providers/NamespaceProvider';

const mockPush = vi.fn();
const mockGetSearchParam = vi.fn();
const mockSearchParamsToString = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
  })),
  usePathname: vi.fn(() => '/agents'),
  useSearchParams: vi.fn(() => ({
    get: mockGetSearchParam,
    toString: mockSearchParamsToString,
  })),
}));

const mockGetContext = vi.fn();
const mockGetAllNamespaces = vi.fn();

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useGetContext: (...args: unknown[]) => mockGetContext(...args),
  useGetAllNamespaces: (...args: unknown[]) => mockGetAllNamespaces(...args),
  useCreateNamespace: vi.fn(() => ({
    mutate: vi.fn(),
  })),
  GET_CONTEXT_QUERY_KEY: 'get-context',
  GET_ALL_NAMESPACES_QUERY_KEY: 'get-all-namespaces',
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { toast } from 'sonner';

import { NamespaceProvider } from '@/providers/NamespaceProvider';

describe('NamespaceProvider', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockPush.mockClear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NamespaceProvider>{children}</NamespaceProvider>
    </QueryClientProvider>
  );

  describe('when namespace exists', () => {
    it('should not show error or redirect', async () => {
      mockGetSearchParam.mockReturnValue('default');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'default',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [
          { name: 'default', id: 0 },
          { name: 'testing', id: 1 },
        ],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('default');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      expect(toast.error).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should resolve namespace when it exists in the list', async () => {
      mockGetSearchParam.mockReturnValue('testing');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'testing',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [
          { name: 'default', id: 0 },
          { name: 'testing', id: 1 },
        ],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('testing');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      expect(toast.error).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('when namespace does not exist', () => {
    it.skip('should show error and redirect to default namespace', async () => {
      mockGetSearchParam.mockReturnValue('non-existent-ns');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'non-existent-ns',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [
          { name: 'default', id: 0 },
          { name: 'testing', id: 1 },
        ],
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Namespace does not exist', {
          description:
            'The namespace "non-existent-ns" does not exist. Redirecting to default namespace.',
        });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/agents?namespace=default');
      });
    });

    it('should not redirect if namespace is already default', async () => {
      mockGetSearchParam.mockReturnValue('default');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'default',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [{ name: 'testing', id: 1 }],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('default');
      });

      expect(toast.error).not.toHaveBeenCalledWith(
        'Namespace does not exist',
        expect.any(Object),
      );
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should show error when namespaces fail to load', async () => {
      mockGetSearchParam.mockReturnValue('default');
      mockGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: null,
        isPending: false,
        error: new Error('Failed to fetch namespaces'),
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to get namespace', {
          description: 'An unexpected error occurred',
        });
      });
    });

    it('should show error when context fails to load', async () => {
      mockGetSearchParam.mockReturnValue('default');
      mockGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: new Error('Failed to fetch context'),
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [{ name: 'default', id: 0 }],
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to get namespace', {
          description: 'Failed to fetch context',
        });
      });
    });
  });

  describe('available namespaces', () => {
    it('should populate availableNamespaces from API', async () => {
      mockGetSearchParam.mockReturnValue('default');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'default',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [
          { name: 'default', id: 0 },
          { name: 'testing', id: 1 },
          { name: 'production', id: 2 },
        ],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.availableNamespaces).toHaveLength(1);
        expect(result.current.availableNamespaces[0].name).toBe('default');
      });

      expect(result.current.availableNamespaces).toEqual([
        { name: 'default', id: 0 },
      ]);
    });
  });

  describe('setNamespace', () => {
    it('preserves existing query params when setNamespace is called', async () => {
      mockGetSearchParam.mockReturnValue('test-ns');
      mockSearchParamsToString.mockReturnValue('namespace=test-ns&filter=active');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'test-ns',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [
          { name: 'default', id: 0 },
          { name: 'test-ns', id: 1 },
          { name: 'production', id: 2 },
        ],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      act(() => {
        result.current.setNamespace('production');
      });

      expect(mockPush).toHaveBeenCalledWith(
        '/agents?namespace=production&filter=active',
      );
    });
  });
});
