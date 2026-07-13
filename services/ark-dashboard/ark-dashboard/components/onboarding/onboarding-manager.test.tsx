import { fireEvent, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  onboardingPhaseAtom,
  storedOnboardingCompletedAtom,
} from '@/atoms/onboarding';
import { OnboardingManager } from './onboarding-manager';

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function renderManager(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <OnboardingManager />
    </Provider>,
  );
}

describe('OnboardingManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('auto-opens the welcome dialog on first visit', () => {
    renderManager(createStore());
    expect(screen.getByText('Welcome to ARK')).toBeInTheDocument();
  });

  it('starts the tour from the welcome dialog', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Start Guided Tour/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('tour');
  });

  it('skips onboarding and shows the floating relaunch button', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(
      screen.getByRole('button', { name: /Take the Tour/i }),
    ).toBeInTheDocument();
  });

  it('does not auto-open once onboarding is completed', () => {
    const store = createStore();
    store.set(storedOnboardingCompletedAtom, true);
    renderManager(store);
    expect(screen.queryByText('Welcome to ARK')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Take the Tour/i }),
    ).toBeInTheDocument();
  });
});
