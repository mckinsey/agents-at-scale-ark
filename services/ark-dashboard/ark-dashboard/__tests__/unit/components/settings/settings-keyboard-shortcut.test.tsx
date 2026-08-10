import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { usePathname, useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

import { SettingsKeyboardShortcut } from '@/components/settings/settings-keyboard-shortcut';

describe('SettingsKeyboardShortcut', () => {
  const mockPush = vi.fn();
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/agents');
  });

  const renderShortcut = () =>
    render(
      <Provider store={store}>
        <SettingsKeyboardShortcut />
      </Provider>,
    );

  const pressShortcut = (opts: Partial<KeyboardEventInit>) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        bubbles: true,
        ...opts,
      }),
    );
  };

  it('should navigate to /settings when Cmd+E is pressed', () => {
    renderShortcut();
    pressShortcut({ metaKey: true });
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('should navigate to /settings when Ctrl+E is pressed', () => {
    renderShortcut();
    pressShortcut({ ctrlKey: true });
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('should not navigate when E is pressed without modifier', () => {
    renderShortcut();
    pressShortcut({});
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should navigate back to entry URL when Cmd+E is pressed on settings page', () => {
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/settings/secrets');
    store.set(settingsEntryUrlAtom, '/models');
    renderShortcut();
    pressShortcut({ metaKey: true });
    expect(mockPush).toHaveBeenCalledWith('/models');
  });

  it('should navigate to home when Cmd+E is pressed on settings page with no entry URL', () => {
    (usePathname as ReturnType<typeof vi.fn>).mockReturnValue('/settings/secrets');
    renderShortcut();
    pressShortcut({ metaKey: true });
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
