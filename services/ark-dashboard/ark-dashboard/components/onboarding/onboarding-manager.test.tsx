import { fireEvent, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  onboardingPhaseAtom,
  storedOnboardingCompletedAtom,
  tourStepAtom,
} from '@/atoms/onboarding';
import { TOUR_STEPS } from '@/lib/constants/tour-steps';

import { OnboardingManager } from './onboarding-manager';

const mockPush = vi.fn();

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush, replace: vi.fn() }),
}));

const nextButton = () =>
  screen.getByRole('button', { name: /Next|Finish Tour/i });

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
    mockPush.mockClear();
  });

  it('auto-opens the welcome dialog on first visit', () => {
    renderManager(createStore());
    expect(screen.getByText('Welcome to Ark')).toBeInTheDocument();
    expect(screen.getByText(`${TOUR_STEPS.length} steps`)).toBeInTheDocument();
  });

  it('starts the tour from the welcome dialog', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Start Guided Tour/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('tour');
    expect(store.get(tourStepAtom)).toBe(0);
  });

  it('skips onboarding and shows the floating relaunch button', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(store.get(storedOnboardingCompletedAtom)).toBe(true);
    expect(
      screen.getByRole('button', { name: /Take the Tour/i }),
    ).toBeInTheDocument();
  });

  it('marks onboarding completed when the welcome dialog is closed', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(store.get(storedOnboardingCompletedAtom)).toBe(true);
  });

  it('does not auto-open once onboarding is completed', () => {
    const store = createStore();
    store.set(storedOnboardingCompletedAtom, true);
    renderManager(store);
    expect(screen.queryByText('Welcome to Ark')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Take the Tour/i }),
    ).toBeInTheDocument();
  });

  it('walks the tour to completion and creates the first agent', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Start Guided Tour/i }));
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      fireEvent.click(nextButton());
    }
    expect(store.get(onboardingPhaseAtom)).toBe('post_tour');
    expect(store.get(storedOnboardingCompletedAtom)).toBe(true);
    expect(screen.getByText('Tour complete')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Create my first agent/i }),
    );
    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(mockPush).toHaveBeenCalledWith('/agents/new');
  });

  it('supports Back navigation during the tour', () => {
    const store = createStore();
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Start Guided Tour/i }));
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(store.get(tourStepAtom)).toBe(0);
  });

  it('pauses on a step action, navigates, and resumes on the next step', () => {
    const store = createStore();
    renderManager(store);
    const actionStep = TOUR_STEPS.findIndex(step => step.action);
    fireEvent.click(screen.getByRole('button', { name: /Start Guided Tour/i }));
    for (let i = 0; i < actionStep; i++) {
      fireEvent.click(nextButton());
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(TOUR_STEPS[actionStep].action ?? '', 'i'),
      }),
    );
    expect(store.get(onboardingPhaseAtom)).toBe('paused');
    expect(mockPush).toHaveBeenCalledWith(TOUR_STEPS[actionStep].actionHref);
    expect(store.get(storedOnboardingCompletedAtom)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Resume tour/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('tour');
    expect(store.get(tourStepAtom)).toBe(actionStep + 1);
  });

  it('restarts from the first step via the floating button', () => {
    const store = createStore();
    store.set(storedOnboardingCompletedAtom, true);
    store.set(tourStepAtom, 4);
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Take the Tour/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('tour');
    expect(store.get(tourStepAtom)).toBe(0);
  });

  it('dismisses the completion dialog with maybe later', () => {
    const store = createStore();
    store.set(storedOnboardingCompletedAtom, true);
    store.set(onboardingPhaseAtom, 'post_tour');
    renderManager(store);
    fireEvent.click(screen.getByRole('button', { name: /Maybe later/i }));
    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
