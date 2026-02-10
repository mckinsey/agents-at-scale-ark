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
