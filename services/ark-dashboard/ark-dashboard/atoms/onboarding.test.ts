import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { TOUR_STEPS } from '@/lib/constants/tour-steps';

import {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_PHASE_KEY,
  ONBOARDING_TOUR_STEP_KEY,
  completeOnboardingAtom,
  initOnboardingAtom,
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
    sessionStorage.clear();
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

  it('persists phase and tour step to sessionStorage', () => {
    const store = createStore();

    store.set(onboardingPhaseAtom, 'paused');
    store.set(tourStepAtom, 2);

    expect(sessionStorage.getItem(ONBOARDING_PHASE_KEY)).toBe('"paused"');
    expect(sessionStorage.getItem(ONBOARDING_TOUR_STEP_KEY)).toBe('2');
    expect(localStorage.getItem(ONBOARDING_PHASE_KEY)).toBeNull();
  });

  it.each(['tour', 'paused'] as const)(
    'restores a %s phase as paused on init',
    storedPhase => {
      sessionStorage.setItem(ONBOARDING_PHASE_KEY, JSON.stringify(storedPhase));
      const store = createStore();

      store.set(initOnboardingAtom);

      expect(store.get(onboardingPhaseAtom)).toBe('paused');
    },
  );

  it.each(['idle', 'welcome', 'post_tour'] as const)(
    'opens the welcome phase on init when the stored phase is %s',
    storedPhase => {
      sessionStorage.setItem(ONBOARDING_PHASE_KEY, JSON.stringify(storedPhase));
      const store = createStore();

      store.set(initOnboardingAtom);

      expect(store.get(onboardingPhaseAtom)).toBe('welcome');
    },
  );

  it('stays idle on init once onboarding is completed', () => {
    sessionStorage.setItem(ONBOARDING_PHASE_KEY, '"post_tour"');
    const store = createStore();
    store.set(completeOnboardingAtom);

    store.set(initOnboardingAtom);

    expect(store.get(onboardingPhaseAtom)).toBe('idle');
    expect(sessionStorage.getItem(ONBOARDING_PHASE_KEY)).toBe('"post_tour"');
  });
});
