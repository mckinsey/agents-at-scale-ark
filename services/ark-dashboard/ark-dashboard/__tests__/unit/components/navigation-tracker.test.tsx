import { render } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  lastListUrlAtom,
  settingsEntryUrlAtom,
} from '@/atoms/navigation-history';
import { NavigationTracker } from '@/components/navigation-tracker';

const mockUsePathname = vi.fn<() => string>();
const mockUseSearchParams = vi.fn<() => URLSearchParams>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

describe('NavigationTracker', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/agents');
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  const renderTracker = () =>
    render(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );

  const navigateTo = (
    rerender: (ui: React.ReactElement) => void,
    pathname: string,
    query = '',
  ) => {
    mockUsePathname.mockReturnValue(pathname);
    mockUseSearchParams.mockReturnValue(new URLSearchParams(query));
    rerender(
      <JotaiProvider store={store}>
        <NavigationTracker />
      </JotaiProvider>,
    );
  };

  it('should not set settingsEntryUrl on initial mount', () => {
    renderTracker();
    expect(store.get(settingsEntryUrlAtom)).toBeNull();
  });

  it('should capture entry URL when navigating into settings', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/settings/a2a-servers');

    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');
  });

  it('should not update entry URL when navigating between settings pages', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/settings/a2a-servers');
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');

    navigateTo(rerender, '/settings/memory');
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');
  });

  it('should clear entry URL when leaving settings', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/settings/a2a-servers');
    expect(store.get(settingsEntryUrlAtom)).toBe('/agents');

    navigateTo(rerender, '/models');
    expect(store.get(settingsEntryUrlAtom)).toBeNull();
  });

  it('captures the screen state alongside the pathname when entering settings', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'type=Error&page=3');
    navigateTo(rerender, '/settings/a2a-servers');

    expect(store.get(settingsEntryUrlAtom)).toBe('/events?type=Error&page=3');
  });

  it('remembers the current URL for the route it belongs to', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'type=Error&page=3');

    expect(store.get(lastListUrlAtom)).toEqual({
      '/agents': '/agents',
      '/events': '/events?type=Error&page=3',
    });
  });

  it('remembers each route separately', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'type=Error');
    navigateTo(rerender, '/agents', 'q=alpha');

    expect(store.get(lastListUrlAtom)).toEqual({
      '/agents': '/agents?q=alpha',
      '/events': '/events?type=Error',
    });
  });

  it('replaces the remembered URL when the same route is visited again', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'type=Error');
    navigateTo(rerender, '/events', 'type=Warning');

    expect(store.get(lastListUrlAtom)).toEqual({
      '/agents': '/agents',
      '/events': '/events?type=Warning',
    });
  });

  it('strips app-scoped params so a remembered URL cannot restore a stale namespace', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'namespace=old-ns&type=Error');

    expect(store.get(lastListUrlAtom)).toEqual({
      '/agents': '/agents',
      '/events': '/events?type=Error',
    });
  });

  it('remembers a bare route when the screen carries no state', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/events', 'namespace=test-ns');

    expect(store.get(lastListUrlAtom)).toEqual({
      '/agents': '/agents',
      '/events': '/events',
    });
  });

  it('does not remember settings routes as return targets', () => {
    const { rerender } = renderTracker();

    navigateTo(rerender, '/settings/a2a-servers', 'tab=x');

    expect(store.get(lastListUrlAtom)).toEqual({ '/agents': '/agents' });
  });
});
