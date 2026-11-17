import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_COMPLETED_KEY,
  completeOnboardingAtom,
  onboardingPhaseAtom,
  tourStepAtom,
} from '@/atoms/onboarding';
import { GeneralSettings } from '@/components/settings/general-settings';

const mockPush = vi.fn();

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush, replace: vi.fn() }),
}));

describe('GeneralSettings', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    localStorage.clear();
    store = createStore();
    mockPush.mockClear();
  });

  const renderWithStore = () =>
    render(
      <Provider store={store}>
        <GeneralSettings />
      </Provider>,
    );

  it('renders the guided tour setting', () => {
    renderWithStore();
    expect(screen.getByText('Guided tour')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Take tour again' }),
    ).toBeInTheDocument();
  });

  it('resets onboarding and navigates home when taking the tour again', async () => {
    store.set(completeOnboardingAtom);
    store.set(tourStepAtom, 3);
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByRole('button', { name: 'Take tour again' }));

    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    expect(store.get(onboardingPhaseAtom)).toBe('welcome');
    expect(store.get(tourStepAtom)).toBe(0);
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
