import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

describe('useNamespacedNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns') as any,
    );
  });

  it('appends existing query params when pushing a path', () => {
    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/agents');

    expect(mockPush).toHaveBeenCalledWith('/agents?namespace=test-ns');
  });

  it('merges path query params with existing search params', () => {
    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/query/new?target_tool=mytool');

    expect(mockPush).toHaveBeenCalledWith(
      '/query/new?namespace=test-ns&target_tool=mytool',
    );
  });

  it('preserves multiple existing query params', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns&filter=active') as any,
    );

    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/agents');

    expect(mockPush).toHaveBeenCalledWith(
      '/agents?namespace=test-ns&filter=active',
    );
  });

  it('passes router options through', () => {
    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/agents', { scroll: false });

    expect(mockPush).toHaveBeenCalledWith('/agents?namespace=test-ns', {
      scroll: false,
    });
  });

  it('handles null searchParams gracefully', () => {
    vi.mocked(useSearchParams).mockReturnValue(null as any);

    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/agents');

    expect(mockPush).toHaveBeenCalledWith('/agents');
  });

  it('does not duplicate params already in the path', () => {
    const { result } = renderHook(() => useNamespacedNavigation());

    result.current.push('/agents?namespace=other-ns');

    expect(mockPush).toHaveBeenCalledWith('/agents?namespace=other-ns');
  });
});
