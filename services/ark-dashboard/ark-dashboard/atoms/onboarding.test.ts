import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { TOUR_STEPS } from '@/lib/constants/tour-steps';

import {
  ONBOARDING_COMPLETED_KEY,
  completeOnboardingAtom,
  onboardingCompletedAtom,
  onboardingPhaseAtom,
  restartOnboardingAtom,
  storedOnboardingCompletedAtom,
  tourActiveSectionAtom,
  tourStepAtom,
} from './onboarding';

describe('onboarding atoms', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes the active nav section only while the tour is running', () => {
    const store = createStore();
    store.set(tourStepAtom, 1);

    store.set(onboardingPhaseAtom, 'idle');
    expect(store.get(tourActiveSectionAtom)).toBeNull();

    store.set(onboardingPhaseAtom, 'paused');
    expect(store.get(tourActiveSectionAtom)).toBeNull();

    store.set(onboardingPhaseAtom, 'tour');
    expect(store.get(tourActiveSectionAtom)).toBe(TOUR_STEPS[1].targetId);

    store.set(tourStepAtom, TOUR_STEPS.length + 5);
    expect(store.get(tourActiveSectionAtom)).toBeNull();
  });

  it('persists completion through completeOnboardingAtom', () => {
    const store = createStore();
    expect(store.get(onboardingCompletedAtom)).toBe(false);

    store.set(completeOnboardingAtom);

    expect(store.get(onboardingCompletedAtom)).toBe(true);
    expect(store.get(storedOnboardingCompletedAtom)).toBe(true);
  });

  it('clears stored completion and returns to the welcome phase on restart', () => {
    const store = createStore();
    store.set(completeOnboardingAtom);
    store.set(tourStepAtom, 3);
    store.set(onboardingPhaseAtom, 'idle');
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBe('true');

    store.set(restartOnboardingAtom);

    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    expect(store.get(onboardingCompletedAtom)).toBe(false);
    expect(store.get(tourStepAtom)).toBe(0);
    expect(store.get(onboardingPhaseAtom)).toBe('welcome');
  });
});
