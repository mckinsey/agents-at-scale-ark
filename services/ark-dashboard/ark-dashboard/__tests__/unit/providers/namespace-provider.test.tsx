import { renderHook } from '@testing-library/react';
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

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useCreateNamespace: vi.fn(() => ({ mutate: vi.fn() })),
  useGetContext: vi.fn(() => ({
    data: { namespace: 'test-ns', read_only_mode: false },
    isPending: false,
    error: null,
  })),
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
});
