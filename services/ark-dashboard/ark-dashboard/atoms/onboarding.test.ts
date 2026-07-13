import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { TOUR_STEPS } from '@/components/onboarding/tour-steps';
import {
  completeOnboardingAtom,
  onboardingCompletedAtom,
  onboardingPhaseAtom,
  postTourOpenAtom,
  storedOnboardingCompletedAtom,
  tourActiveAtom,
  tourActiveSectionAtom,
  tourPausedAtom,
  tourStepAtom,
  welcomeOpenAtom,
} from './onboarding';

describe('onboarding atoms', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('derives exactly one boolean flag from the phase', () => {
    const store = createStore();

    store.set(onboardingPhaseAtom, 'welcome');
    expect(store.get(welcomeOpenAtom)).toBe(true);
    expect(store.get(tourActiveAtom)).toBe(false);
    expect(store.get(postTourOpenAtom)).toBe(false);

    store.set(onboardingPhaseAtom, 'tour');
    expect(store.get(tourActiveAtom)).toBe(true);
    expect(store.get(welcomeOpenAtom)).toBe(false);

    store.set(onboardingPhaseAtom, 'paused');
    expect(store.get(tourPausedAtom)).toBe(true);

    store.set(onboardingPhaseAtom, 'post_tour');
    expect(store.get(postTourOpenAtom)).toBe(true);
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
  });

  it('persists completion through completeOnboardingAtom', () => {
    const store = createStore();
    expect(store.get(onboardingCompletedAtom)).toBe(false);

    store.set(completeOnboardingAtom);

    expect(store.get(onboardingCompletedAtom)).toBe(true);
    expect(store.get(storedOnboardingCompletedAtom)).toBe(true);
  });
});
