import { renderHook, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  usePathname: vi.fn(() => '/agents'),
  useSearchParams: vi.fn(
    () => new URLSearchParams('namespace=test-ns&filter=active'),
  ),
}));

interface ContextQueryResult {
  data: {
    namespace?: string;
    read_only_mode?: boolean;
    cluster: string | null;
  } | null;
  isPending: boolean;
  error: unknown;
}

const mockUseGetContext = vi.fn<() => ContextQueryResult>(() => ({
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

vi.mock('@/lib/api/client', () => {
  class APIClient {
    setDefaultParam = vi.fn();
  }
  return {
    APIClient,
    apiClient: {
      setDefaultParam: vi.fn(),
    },
  };
});

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

const INITIAL_URL = 'http://localhost:3000/agents';

describe('NamespaceProvider - Namespace Resolution Logic', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', INITIAL_URL);
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
    window.history.replaceState(null, '', INITIAL_URL);
  });

  describe('Scenario 1: Query param provided and valid', () => {
    it('should use the query param namespace when API validates it successfully', async () => {
      // Setup: ?namespace=tenant-a in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
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
        new URLSearchParams('') as never,
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
        new URLSearchParams('namespace=invalid-ns') as never,
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
        { description: 'Using tenant-a instead' },
      );

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should not show error toast when no query param was provided', async () => {
      // Setup: No ?namespace in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
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
        expect.anything(),
      );
    });
  });

  describe('Scenario 4: Final fallback to default', () => {
    it('should fall back to "default" when API fails with no default_namespace in error', async () => {
      // Setup: ?namespace=invalid-ns in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as never,
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
        { description: 'Using default namespace' },
      );

      // Should NOT redirect
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should fall back to "default" when no query param and API fails completely', async () => {
      // Setup: No ?namespace in URL
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
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
        { description: 'Using default namespace' },
      );
    });
  });

  describe('Read-only mode detection', () => {
    it('should set read-only mode when API returns read_only_mode: true', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
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
        new URLSearchParams('') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.readOnlyMode).toBe(false);
      });
    });
  });

  describe('URL synchronisation', () => {
    it('writes the resolved namespace into the URL when none was requested', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null,
          '',
          '?namespace=tenant-b',
        );
      });

      expect(window.location.search).toBe('?namespace=tenant-b');
    });

    it('keeps the other params when adding the namespace', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('status=failed') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(
          null,
          '',
          '?status=failed&namespace=tenant-b',
        );
      });
    });

    it('does not touch the URL when it already names the active namespace', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it('adds no browser history entry', async () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState');

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalled();
      });

      expect(pushStateSpy).not.toHaveBeenCalled();
      pushStateSpy.mockRestore();
    });

    it('writes the fallback namespace into the URL when the requested one is unreachable', async () => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/agents?namespace=invalid-ns',
      );

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: {
          message: "Namespace 'invalid-ns' not found",
          data: { detail: { default_namespace: 'tenant-a' } },
        },
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(window.location.search).toBe('?namespace=tenant-a');
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Namespace "invalid-ns" not accessible',
        { description: 'Using tenant-a instead' },
      );
    });

    it('preserves a configured base path when adding the namespace', async () => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/tenant-a/agents',
      );

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(window.location.search).toBe('?namespace=tenant-b');
      });

      expect(window.location.pathname).toBe('/tenant-a/agents');
    });

    it('preserves a configured base path when correcting an unreachable namespace', async () => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/tenant-a/agents?namespace=invalid-ns',
      );

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as never,
      );

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: {
          message: "Namespace 'invalid-ns' not found",
          data: { detail: { default_namespace: 'tenant-b' } },
        },
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(window.location.search).toBe('?namespace=tenant-b');
      });

      expect(window.location.pathname).toBe('/tenant-a/agents');
    });
  });

  describe('Namespace state across the write-back', () => {
    it('falls back to the default namespace when the response names none', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );
      mockUseGetContext.mockReturnValue({
        data: { namespace: '', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useNamespace(), { wrapper });

      // A response that names no namespace is still an answer — it must not
      // leave the dashboard parked behind its loading gate.
      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });
      expect(result.current.namespace).toBe('default');
    });

    const unreachable = {
      data: null,
      isPending: false,
      error: {
        message: "Namespace 'invalid-ns' not found",
        data: { detail: { default_namespace: 'tenant-a' } },
      },
    };

    const loading = { data: null, isPending: true, error: null };

    it('stays resolved while the corrected namespace is being loaded', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as never,
      );
      mockUseGetContext.mockReturnValue(unreachable);

      const { result, rerender } = renderHook(() => useNamespace(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.namespace).toBe('tenant-a');
      });

      // The correction moved the URL to tenant-a, whose key has no cached
      // response to seed — the substitute came from the error body.
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );
      mockUseGetContext.mockReturnValue(loading);
      rerender();

      expect(result.current.isNamespaceResolved).toBe(true);
      expect(result.current.namespace).toBe('tenant-a');
      // Held from the fallback, which is read-only until the real context lands.
      expect(result.current.readOnlyMode).toBe(true);

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });
      rerender();

      expect(result.current.readOnlyMode).toBe(false);
    });

    it('announces the substitution once', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as never,
      );
      mockUseGetContext.mockReturnValue(unreachable);

      const { result, rerender } = renderHook(() => useNamespace(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.namespace).toBe('tenant-a');
      });

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );
      mockUseGetContext.mockReturnValue(loading);
      rerender();

      expect(
        vi
          .mocked(toast.error)
          .mock.calls.filter(([title]) =>
            String(title).includes('not accessible'),
          ),
      ).toHaveLength(1);
    });

    it('re-arms the loading gate for a genuine namespace change', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );
      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result, rerender } = renderHook(() => useNamespace(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-b') as never,
      );
      mockUseGetContext.mockReturnValue(loading);
      rerender();

      expect(result.current.isNamespaceResolved).toBe(false);
    });

    it('does not write the previous namespace over a newly requested one', async () => {
      window.history.replaceState(
        null,
        '',
        'http://localhost:3000/agents?namespace=tenant-a',
      );
      replaceStateSpy.mockClear();
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-a') as never,
      );
      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-a', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });

      const { result, rerender } = renderHook(() => useNamespace(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isNamespaceResolved).toBe(true);
      });

      // A cached answer for tenant-a is still what the query layer holds while
      // tenant-b loads. It must not be mistaken for the resolved namespace.
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=tenant-b') as never,
      );
      rerender();

      expect(result.current.isNamespaceResolved).toBe(false);
      expect(replaceStateSpy).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?namespace=tenant-a');

      mockUseGetContext.mockReturnValue({
        data: { namespace: 'tenant-b', read_only_mode: false, cluster: null },
        isPending: false,
        error: null,
      });
      rerender();

      expect(result.current.namespace).toBe('tenant-b');
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });
  });
});
