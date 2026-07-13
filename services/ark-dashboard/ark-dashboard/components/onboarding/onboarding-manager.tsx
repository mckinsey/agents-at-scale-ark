'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import {
  completeOnboardingAtom,
  onboardingCompletedAtom,
  onboardingPhaseAtom,
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

  const [phase, setPhase] = useAtom(onboardingPhaseAtom);
  const [tourStep, setTourStep] = useAtom(tourStepAtom);

  const hasCheckedFirstVisit = useRef(false);

  useEffect(() => {
    if (hasCheckedFirstVisit.current) return;
    hasCheckedFirstVisit.current = true;
    if (!completed) {
      setPhase('welcome');
    }
  }, [completed, setPhase]);

  const startTour = () => {
    setTourStep(0);
    setPhase('tour');
  };

  const skipWelcome = () => {
    setPhase('idle');
    completeOnboarding();
  };

  const handleNext = () => {
    if (tourStep >= TOUR_STEPS.length - 1) {
      completeOnboarding();
      setPhase('post_tour');
    } else {
      setTourStep(tourStep + 1);
    }
  };

  const handlePrev = () => {
    if (tourStep > 0) setTourStep(tourStep - 1);
  };

  const skipTour = () => {
    setPhase('idle');
    completeOnboarding();
  };

  const handleAction = (href: string) => {
    setTourStep(Math.min(tourStep + 1, TOUR_STEPS.length - 1));
    setPhase('paused');
    push(href);
  };

  const handleFloatingClick = () => {
    if (phase !== 'paused') setTourStep(0);
    setPhase('tour');
  };

  return (
    <>
      <WelcomeDialog
        open={phase === 'welcome'}
        onOpenChange={open => {
          if (!open) skipWelcome();
        }}
        onStart={startTour}
        onSkip={skipWelcome}
      />

      {phase === 'tour' && (
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
        open={phase === 'post_tour'}
        onOpenChange={open => {
          if (!open) setPhase('idle');
        }}
        onCreateAgent={() => {
          setPhase('idle');
          push('/agents/new');
        }}
        onDismiss={() => setPhase('idle')}
      />

      {(phase === 'idle' || phase === 'paused') && (
        <FloatingTourButton
          label={phase === 'paused' ? 'Resume tour' : 'Take the Tour'}
          onClick={handleFloatingClick}
        />
      )}
    </>
  );
}
