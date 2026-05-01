import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  activeSettingPageAtom,
  settingsModalOpenAtom,
} from '@/atoms/settings-modal';
import { SettingsSidebar } from '@/components/settings-modal/settings-sidebar';

describe('SettingsSidebar', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    store.set(settingsModalOpenAtom, true);
  });

  const renderWithStore = () =>
    render(
      <Provider store={store}>
        <SettingsSidebar />
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

  it('should update active page when a menu item is clicked', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByText('Memory'));

    expect(store.get(activeSettingPageAtom)).toBe('memory');
  });

  it('should close modal when close button is clicked', async () => {
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByLabelText('Close settings'));

    expect(store.get(settingsModalOpenAtom)).toBe(false);
  });
});
