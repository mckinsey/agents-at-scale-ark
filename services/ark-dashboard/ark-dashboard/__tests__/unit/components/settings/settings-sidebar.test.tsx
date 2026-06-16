import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, createStore } from 'jotai';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsEntryUrlAtom } from '@/atoms/navigation-history';
import type { SettingPage } from '@/components/settings/settings-types';
import { SettingsSidebar } from '@/components/settings/settings-sidebar';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
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
  });

  const renderWithStore = (activePage: SettingPage = 'a2a-servers') =>
    render(
      <Provider store={store}>
        <SettingsSidebar activePage={activePage} />
      </Provider>,
    );

  it('should render Settings heading', () => {
    renderWithStore();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render all section labels', () => {
    renderWithStore();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
  });

  it('should render all menu items', () => {
    renderWithStore();
    expect(screen.getByText('A2A Servers')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Experimental Features')).toBeInTheDocument();
    expect(screen.getByText('Service API Keys')).toBeInTheDocument();
    expect(screen.getByText('Secrets')).toBeInTheDocument();
  });

  it('should navigate to settings page when a menu item is clicked', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByText('Memory'));

    expect(mockReplace).toHaveBeenCalledWith('/settings/memory');
  });

  it('should navigate to entry URL when close button is clicked after soft navigation', async () => {
    store.set(settingsEntryUrlAtom, '/agents');

    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByLabelText('Close settings'));

    expect(mockPush).toHaveBeenCalledWith('/agents');
  });

  it('should navigate to home when close button is clicked on direct navigation', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByLabelText('Close settings'));

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
