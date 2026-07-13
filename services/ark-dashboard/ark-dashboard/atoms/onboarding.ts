import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const ONBOARDING_COMPLETED_KEY = 'onboarding-completed';
export const storedOnboardingCompletedAtom = atomWithStorage<boolean>(
  ONBOARDING_COMPLETED_KEY,
  false,
  undefined,
  { getOnInit: true },
);

export const onboardingCompletedAtom = atom(get => {
  return get(storedOnboardingCompletedAtom);
});

export const onboardingWizardOpenAtom = atom<boolean>(false);

export const tourActiveAtom = atom<boolean>(false);

export const tourStepAtom = atom<number>(0);

export const tourPausedAtom = atom<boolean>(false);

export const tourActiveSectionAtom = atom<string | null>(null);

export const postTourOpenAtom = atom<boolean>(false);

export const completeOnboardingAtom = atom(null, (_get, set) => {
  set(storedOnboardingCompletedAtom, true);
});
