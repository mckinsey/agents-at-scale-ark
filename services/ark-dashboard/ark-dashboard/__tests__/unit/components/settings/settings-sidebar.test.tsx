import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, createStore } from 'jotai';
import { useRouter, useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storedIsMarketplaceEnabledAtom } from '@/atoms/experimental-features';
import { settingsEntryUrlAtom } from '@/atoms/navigation-history';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';
import type { SettingPage } from '@/components/settings/settings-types';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe('SettingsSidebar', () => {
  let store: ReturnType<typeof createStore>;
  const mockPush = vi.fn();
  const mockReplace = vi.fn();
  const mockBack = vi.fn();

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
    });
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('namespace=demo'),
    );
  });

  const renderWithStore = (activePage: SettingPage = 'queries') =>
    render(
      <Provider store={store}>
        <SettingsSidebar activePage={activePage} />
      </Provider>,
    );

  it('should render Settings heading', () => {
    renderWithStore();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render all menu items', () => {
    renderWithStore();
    expect(screen.getByText('Queries')).toBeInTheDocument();
    expect(screen.getByText('Experimental features')).toBeInTheDocument();
  });

  it('should hide Manage marketplace when the marketplace flag is off', () => {
    renderWithStore();
    expect(screen.queryByText('Manage marketplace')).not.toBeInTheDocument();
  });

  it('should reveal Manage marketplace when the marketplace flag is enabled', () => {
    store.set(storedIsMarketplaceEnabledAtom, true);
    renderWithStore();
    expect(screen.getByText('Manage marketplace')).toBeInTheDocument();
  });

  it('should navigate to settings page preserving namespace when a menu item is clicked', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByText('Queries'));

    expect(mockReplace).toHaveBeenCalledWith(
      '/settings/queries?namespace=demo',
    );
  });

  it('should navigate to entry URL preserving namespace when close button is clicked after soft navigation', async () => {
    store.set(settingsEntryUrlAtom, '/agents');

    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByLabelText('Close settings'));

    expect(mockPush).toHaveBeenCalledWith('/agents?namespace=demo');
  });

  it('should navigate to home preserving namespace when close button is clicked on direct navigation', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByLabelText('Close settings'));

    expect(mockPush).toHaveBeenCalledWith('/?namespace=demo');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
