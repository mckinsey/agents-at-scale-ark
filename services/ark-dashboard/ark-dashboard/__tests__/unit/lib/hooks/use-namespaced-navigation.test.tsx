import { renderHook } from '@testing-library/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: mockReplace })),
  usePathname: vi.fn(() => '/dashboard'),
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

describe('useNamespacedNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/dashboard');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns') as never,
    );
  });

  describe('push', () => {
    it('carries the namespace onto the destination', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.push('/agents');

      expect(mockPush).toHaveBeenCalledWith('/agents?namespace=test-ns');
    });

    it('merges params named by the target with the namespace', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.push('/query/new?target_tool=mytool');

      expect(mockPush).toHaveBeenCalledWith(
        '/query/new?namespace=test-ns&target_tool=mytool',
      );
    });

    it('drops page-local params when leaving the screen', () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=test-ns&name=default') as never,
      );
      vi.mocked(usePathname).mockReturnValue('/models/new');

      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.push('/agents');

      expect(mockPush).toHaveBeenCalledWith('/agents?namespace=test-ns');
    });

    it('keeps screen-owned params when the pathname is unchanged', () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=test-ns&status=failed') as never,
      );
      vi.mocked(usePathname).mockReturnValue('/events');

      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.push('/events?page=2');

      expect(mockPush).toHaveBeenCalledWith(
        '/events?namespace=test-ns&status=failed&page=2',
      );
    });

    it('detects a same-screen navigation when a base path is configured', () => {
      // usePathname() is base-path-stripped, and hrefs are authored unprefixed,
      // so both sides of the comparison stay prefix-free under /tenant-a.
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=test-ns&status=failed') as never,
      );
      vi.mocked(usePathname).mockReturnValue('/events');

      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.push('/events');

      expect(mockPush).toHaveBeenCalledWith(
        '/events?namespace=test-ns&status=failed',
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
      vi.mocked(useSearchParams).mockReturnValue(null as never);

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

  describe('replace', () => {
    it('carries the namespace onto the destination', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory');

      expect(mockReplace).toHaveBeenCalledWith(
        '/settings/memory?namespace=test-ns',
      );
    });

    it('merges params named by the target with the namespace', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory?tab=general');

      expect(mockReplace).toHaveBeenCalledWith(
        '/settings/memory?namespace=test-ns&tab=general',
      );
    });

    it('drops page-local params when leaving the screen', () => {
      vi.mocked(useSearchParams).mockReturnValue(
        new URLSearchParams('namespace=test-ns&name=default') as never,
      );

      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory');

      expect(mockReplace).toHaveBeenCalledWith(
        '/settings/memory?namespace=test-ns',
      );
    });

    it('passes router options through', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory', { scroll: false });

      expect(mockReplace).toHaveBeenCalledWith(
        '/settings/memory?namespace=test-ns',
        { scroll: false },
      );
    });

    it('handles null searchParams gracefully', () => {
      vi.mocked(useSearchParams).mockReturnValue(null as never);

      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory');

      expect(mockReplace).toHaveBeenCalledWith('/settings/memory');
    });

    it('does not duplicate params already in the path', () => {
      const { result } = renderHook(() => useNamespacedNavigation());

      result.current.replace('/settings/memory?namespace=other-ns');

      expect(mockReplace).toHaveBeenCalledWith(
        '/settings/memory?namespace=other-ns',
      );
    });
  });
});
