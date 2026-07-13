import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { TOUR_STEPS } from '@/components/onboarding/tour-steps';

export const ONBOARDING_COMPLETED_KEY = 'onboarding-completed';
export const storedOnboardingCompletedAtom = atomWithStorage<boolean>(
  ONBOARDING_COMPLETED_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const onboardingCompletedAtom = atom(get =>
  get(storedOnboardingCompletedAtom),
);

export type OnboardingPhase = 'idle' | 'welcome' | 'tour' | 'paused' | 'post_tour';

export const onboardingPhaseAtom = atom<OnboardingPhase>('idle');

export const tourStepAtom = atom<number>(0);

export const welcomeOpenAtom = atom(
  get => get(onboardingPhaseAtom) === 'welcome',
);

export const tourActiveAtom = atom(get => get(onboardingPhaseAtom) === 'tour');

export const tourPausedAtom = atom(get => get(onboardingPhaseAtom) === 'paused');

export const postTourOpenAtom = atom(
  get => get(onboardingPhaseAtom) === 'post_tour',
);

export const tourActiveSectionAtom = atom(get =>
  get(onboardingPhaseAtom) === 'tour'
    ? (TOUR_STEPS[get(tourStepAtom)]?.targetId ?? null)
    : null,
);

export const completeOnboardingAtom = atom(null, (_get, set) => {
  set(storedOnboardingCompletedAtom, true);
});
