import { render } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasSoftNavigatedAtom } from '@/atoms/navigation-history';
import { NavigationTracker } from '@/hooks/use-navigation-history';

const mockUsePathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('NavigationTracker', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/settings/a2a-servers');
  });

  const renderTracker = () =>
    render(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );

  it('should not set hasSoftNavigated on initial mount', () => {
    renderTracker();
    expect(store.get(hasSoftNavigatedAtom)).toBe(false);
  });

  it('should set hasSoftNavigated to true when pathname changes', () => {
    const { rerender } = renderTracker();
    expect(store.get(hasSoftNavigatedAtom)).toBe(false);

    mockUsePathname.mockReturnValue('/settings/memory');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );

    expect(store.get(hasSoftNavigatedAtom)).toBe(true);
  });

  it('should remain true after multiple pathname changes', () => {
    const { rerender } = renderTracker();

    mockUsePathname.mockReturnValue('/settings/memory');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(hasSoftNavigatedAtom)).toBe(true);

    mockUsePathname.mockReturnValue('/agents');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(hasSoftNavigatedAtom)).toBe(true);
  });
});
