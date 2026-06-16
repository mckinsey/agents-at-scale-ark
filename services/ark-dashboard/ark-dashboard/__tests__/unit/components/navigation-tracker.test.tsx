import { render } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';
import { NavigationTracker } from '@/components/navigation-tracker';

const mockUsePathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('NavigationTracker', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/agents');
  });

  const renderTracker = () =>
    render(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );

  it('should not set settingsEntryUrl on initial mount', () => {
    renderTracker();
    expect(store.get(settingsEntryUrlAtom)).toBeNull();
  });

  it('should capture entry URL when navigating into settings', () => {
    const { rerender } = renderTracker();

    mockUsePathname.mockReturnValue('/settings/a2a-servers');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );

    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');
  });

  it('should not update entry URL when navigating between settings pages', () => {
    const { rerender } = renderTracker();

    mockUsePathname.mockReturnValue('/settings/a2a-servers');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');

    mockUsePathname.mockReturnValue('/settings/memory');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');
  });

  it('should clear entry URL when leaving settings', () => {
    const { rerender } = renderTracker();

    mockUsePathname.mockReturnValue('/settings/a2a-servers');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');

    mockUsePathname.mockReturnValue('/models');
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
    expect(store.get(settingsEntryUrlAtom)).toBeNull();
  });
});
