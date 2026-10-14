import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INSTALL_TOTAL_DURATION_MS } from '@/lib/services/marketplace-install-mock';

import { MarketplaceInstallWatcher } from './marketplace-install-watcher';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));
vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function seedInstalling(itemId: string, itemName: string) {
  localStorage.setItem(
    'marketplace-install-records',
    JSON.stringify({
      [`test-namespace/${itemId}`]: {
        state: 'installing',
        startedAt: new Date().toISOString(),
        itemName,
      },
    }),
  );
}

function storedState(itemId: string): string | undefined {
  const stored = JSON.parse(
    localStorage.getItem('marketplace-install-records') ?? '{}',
  );
  return stored[`test-namespace/${itemId}`]?.state;
}

describe('MarketplaceInstallWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders nothing — it exists only to advance and announce installs', () => {
    const { container } = render(<MarketplaceInstallWatcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('settles an install that finishes while the user is on another page', async () => {
    vi.useFakeTimers();
    seedInstalling('a2a-inspector', 'A2A Inspector');

    render(<MarketplaceInstallWatcher />);
    expect(storedState('a2a-inspector')).toBe('installing');

    // Nothing else is guaranteed to be mounted — a card only exists on
    // /marketplace, so without this the record would never reach a terminal
    // state until it timed out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INSTALL_TOTAL_DURATION_MS + 2000);
    });

    expect(storedState('a2a-inspector')).toBe('installed');
    vi.useRealTimers();
  });

  it('settles a failing install to failed, not installed', async () => {
    vi.useFakeTimers();
    seedInstalling('ark-sandbox', 'ARK Sandbox');

    render(<MarketplaceInstallWatcher />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INSTALL_TOTAL_DURATION_MS + 2000);
    });

    expect(storedState('ark-sandbox')).toBe('failed');
    vi.useRealTimers();
  });
});
