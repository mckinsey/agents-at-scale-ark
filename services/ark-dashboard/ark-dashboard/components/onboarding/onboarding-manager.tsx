'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import {
  completeOnboardingAtom,
  onboardingCompletedAtom,
  onboardingWizardOpenAtom,
  postTourOpenAtom,
  tourActiveAtom,
  tourActiveSectionAtom,
  tourPausedAtom,
  tourStepAtom,
} from '@/atoms/onboarding';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { FloatingTourButton } from './floating-tour-button';
import { PostTourDialog } from './post-tour-dialog';
import { TourSpotlight } from './tour-spotlight';
import { TOUR_STEPS } from './tour-steps';
import { WelcomeDialog } from './welcome-dialog';

export function OnboardingManager() {
  const { push } = useNamespacedNavigation();

  const completed = useAtomValue(onboardingCompletedAtom);
  const completeOnboarding = useSetAtom(completeOnboardingAtom);
  const setTourActiveSection = useSetAtom(tourActiveSectionAtom);

  const [welcomeOpen, setWelcomeOpen] = useAtom(onboardingWizardOpenAtom);
  const [tourActive, setTourActive] = useAtom(tourActiveAtom);
  const [tourStep, setTourStep] = useAtom(tourStepAtom);
  const [tourPaused, setTourPaused] = useAtom(tourPausedAtom);
  const [postTourOpen, setPostTourOpen] = useAtom(postTourOpenAtom);

  const hasCheckedFirstVisit = useRef(false);

  useEffect(() => {
    if (hasCheckedFirstVisit.current) return;
    hasCheckedFirstVisit.current = true;
    if (!completed) {
      setWelcomeOpen(true);
    }
  }, [completed, setWelcomeOpen]);

  useEffect(() => {
    setTourActiveSection(
      tourActive ? (TOUR_STEPS[tourStep]?.targetId ?? null) : null,
    );
  }, [tourActive, tourStep, setTourActiveSection]);

  const startTour = () => {
    setWelcomeOpen(false);
    setTourStep(0);
    setTourPaused(false);
    setTourActive(true);
  };

  const skipWelcome = () => {
    setWelcomeOpen(false);
    completeOnboarding();
  };

  const handleNext = () => {
    if (tourStep >= TOUR_STEPS.length - 1) {
      setTourActive(false);
      setTourPaused(false);
      completeOnboarding();
      setPostTourOpen(true);
    } else {
      setTourStep(tourStep + 1);
    }
  };

  const handlePrev = () => {
    if (tourStep > 0) setTourStep(tourStep - 1);
  };

  const skipTour = () => {
    setTourActive(false);
    setTourPaused(false);
    completeOnboarding();
  };

  const handleAction = (href: string) => {
    setTourStep(Math.min(tourStep + 1, TOUR_STEPS.length - 1));
    setTourActive(false);
    setTourPaused(true);
    push(href);
  };

  const handleFloatingClick = () => {
    if (tourPaused) {
      setTourPaused(false);
      setTourActive(true);
    } else {
      setTourStep(0);
      setTourActive(true);
    }
  };

  return (
    <>
      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={open => {
          if (!open) skipWelcome();
        }}
        onStart={startTour}
        onSkip={skipWelcome}
      />

      {tourActive && (
        <TourSpotlight
          steps={TOUR_STEPS}
          activeStep={tourStep}
          onNext={handleNext}
          onPrev={handlePrev}
          onSkip={skipTour}
          onAction={handleAction}
        />
      )}

      <PostTourDialog
        open={postTourOpen}
        onOpenChange={setPostTourOpen}
        onCreateAgent={() => {
          setPostTourOpen(false);
          push('/agents/new');
        }}
        onDismiss={() => setPostTourOpen(false)}
      />

      {!tourActive && !welcomeOpen && !postTourOpen && (
        <FloatingTourButton
          label={tourPaused ? 'Resume tour' : 'Take the Tour'}
          onClick={handleFloatingClick}
        />
      )}
    </>
  );
}
