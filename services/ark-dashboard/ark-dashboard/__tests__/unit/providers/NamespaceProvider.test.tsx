import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const INITIAL_URL = 'http://localhost:3000/agents';

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
    mockSearchParamsToString.mockReturnValue('');
    window.history.replaceState(null, '', INITIAL_URL);
  });

  afterEach(() => {
    window.history.replaceState(null, '', INITIAL_URL);
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
    it('should show error and correct the URL to the namespace in use', async () => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/agents?namespace=non-existent-ns',
      );
      mockGetSearchParam.mockReturnValue('non-existent-ns');
      mockSearchParamsToString.mockReturnValue('namespace=non-existent-ns');
      mockGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: {
          message: "Namespace 'non-existent-ns' not found",
          data: { detail: { default_namespace: 'default' } },
        },
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
        expect(toast.error).toHaveBeenCalledWith(
          'Namespace "non-existent-ns" not accessible',
          { description: 'Using default instead' },
        );
      });

      await waitFor(() => {
        expect(window.location.search).toBe('?namespace=default');
      });

      // Corrected in place, not navigated to
      expect(mockPush).not.toHaveBeenCalled();
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
        expect(toast.error).toHaveBeenCalledWith('Failed to get namespace context', {
          description: 'Using default namespace',
        });
      });
    });
  });

  describe('URL synchronisation', () => {
    it('preserves existing query params when adding the namespace', async () => {
      mockGetSearchParam.mockReturnValue(null);
      mockSearchParamsToString.mockReturnValue('filter=active');
      mockGetContext.mockReturnValue({
        data: {
          namespace: 'production',
          cluster: 'test-cluster',
          read_only_mode: false,
        },
        isPending: false,
        error: null,
      });
      mockGetAllNamespaces.mockReturnValue({
        data: [{ name: 'production', id: 0 }],
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      await waitFor(() => {
        expect(window.location.search).toBe('?filter=active&namespace=production');
      });
    });
  });

});
