import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  usePathname: vi.fn(() => '/agents'),
  useSearchParams: vi.fn(
    () => new URLSearchParams('namespace=test-ns&filter=active'),
  ),
}));

const mockUseGetContext = vi.fn(() => ({
  data: { namespace: 'test-ns', read_only_mode: false, cluster: null },
  isPending: false,
  error: null,
}));

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useCreateNamespace: vi.fn(() => ({ mutate: vi.fn() })),
  useGetContext: () => mockUseGetContext(),
  useGetAllNamespaces: vi.fn(() => ({
    data: [{ name: 'test-ns' }, { name: 'default' }],
    isPending: false,
    error: null,
  })),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    setDefaultParam: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { NamespaceProvider, useNamespace } from '@/providers/NamespaceProvider';
import { toast } from 'sonner';

function wrapper({ children }: PropsWithChildren) {
  return <NamespaceProvider>{children}</NamespaceProvider>;
}

describe('NamespaceProvider - Namespace Resolution Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: Query param provided and valid', () => {
    it('should use the query param namespace when API validates it successfully', async () => {
      // Setup: ?namespace=tenant-a in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as any,
      );

      // API response validates the namespace
      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('tenant-a');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 2: No query param provided', () => {
    it('should use pod namespace from API when no query param is present', async () => {
      // Setup: No ?namespace in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as any,
      );

      // API returns pod's namespace
      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('tenant-b');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 3: Invalid query param with fallback', () => {
    it('should fall back to API default_namespace when query param namespace is not accessible', async () => {
      // Setup: ?namespace=invalid-ns in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as any,
      );

      // API returns 404 with default_namespace in error
      const apiError = {
        message: "Namespace 'invalid-ns' not found",
        data: {
          detail: {
            message: "Namespace 'invalid-ns' not found",
            default_namespace: 'tenant-a',
          },
        },
      };

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('tenant-a');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      // Should show error toast with fallback message
      expect(toast.error).toHaveBeenCalledWith(
        'Namespace "invalid-ns" not accessible',
        { description: 'Using tenant-a instead' }
      );

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should not show error toast when no query param was provided', async () => {
      // Setup: No ?namespace in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as any,
      );

      // API returns error with default_namespace
      const apiError = {
        message: 'Some error',
        data: {
          detail: {
            default_namespace: 'default',
          },
        },
      };

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('default');
      });

      // Should NOT show "not accessible" error since no query param was provided
      expect(toast.error).not.toHaveBeenCalledWith(
        expect.stringContaining('not accessible'),
        expect.anything()
      );
    });
  });

  describe('Scenario 4: Final fallback to default', () => {
    it('should fall back to "default" when API fails with no default_namespace in error', async () => {
      // Setup: ?namespace=invalid-ns in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as any,
      );

      // API returns error without default_namespace
      const apiError = new Error('Network error');

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('default');
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      // Should show generic error
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to get namespace context',
        { description: 'Using default namespace' }
      );

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should fall back to "default" when no query param and API fails completely', async () => {
      // Setup: No ?namespace in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as any,
      );

      // API fails completely
      const apiError = new Error('Connection refused');

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.namespace).toBe('default');
      });

      // Should show generic error
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to get namespace context',
        { description: 'Using default namespace' }
      );
    });
  });

  describe('Read-only mode detection', () => {
    it('should set read-only mode when API returns read_only_mode: true', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as any,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'demo-ns', read_only_mode: true, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.readOnlyMode).toBe(true);
      });
    });

    it('should default read-only mode to false when not specified', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as any,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', cluster: null },
        isPending: false,
        error: null,
      } as any);

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.readOnlyMode).toBe(false);
      });
    });
  });

  describe('Legacy test: preserves existing query params when setNamespace is called', () => {
    it('preserves existing query params when setNamespace is called', () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=test-ns&filter=active') as any,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'test-ns', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      act(() => {
        result.current.setNamespace('production');
      });

      expect(mockPush).toHaveBeenCalledWith(
        '/agents?namespace=production&filter=active',
      );
    });
  });
});
