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
  data: { namespace: 'test-ns', read_only_mode: false },
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

import { NamespaceProvider, useNamespace } from '@/providers/NamespaceProvider';

function wrapper({ children }: PropsWithChildren) {
  return <NamespaceProvider>{children}</NamespaceProvider>;
}

describe('NamespaceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns&filter=active') as any,
    );
    mockUseGetContext.mockReturnValue({
      data: { namespace: 'test-ns', read_only_mode: false },
      isPending: false,
      error: null,
    });
  });

  it('preserves existing query params when setNamespace is called', () => {
    const { result } = renderHook(() => useNamespace(), { wrapper });

    act(() => {
      result.current.setNamespace('production');
    });

    expect(mockPush).toHaveBeenCalledWith(
      '/agents?namespace=production&filter=active',
    );
  });

  describe('error handling', () => {
    it('redirects to default_namespace from error when namespace not found', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as any,
      );

      // Simulate API error with default_namespace in the response
      const apiError = {
        message: "Namespace 'invalid-ns' not found",
        data: {
          detail: {
            message: "Namespace 'invalid-ns' not found",
            default_namespace: 'kyc-demo',
          },
        },
      };

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/agents?namespace=kyc-demo');
      });
    });

    it('redirects to default when error has no default_namespace', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=invalid-ns') as any,
      );

      // Simulate API error without default_namespace
      const apiError = new Error('Network error');

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      renderHook(() => useNamespace(), { wrapper });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/agents?namespace=default');
      });
    });

    it('does not redirect when already on default namespace and error occurs', async () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=default') as any,
      );

      const apiError = new Error('Network error');

      mockUseGetContext.mockReturnValue({
        data: null,
        isPending: false,
        error: apiError,
      });

      renderHook(() => useNamespace(), { wrapper });

      // Should not redirect since we're already on default
      await waitFor(() => {
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });
});
