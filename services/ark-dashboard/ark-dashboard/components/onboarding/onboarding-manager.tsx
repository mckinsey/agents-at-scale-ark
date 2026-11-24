'use client';

import { useAtom, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';

import {
  completeOnboardingAtom,
  initOnboardingAtom,
  onboardingPhaseAtom,
  tourStepAtom,
} from '@/atoms/onboarding';
import { TOUR_STEPS } from '@/lib/constants/tour-steps';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useNamespace } from '@/providers/NamespaceProvider';

import { FloatingTourButton } from './floating-tour-button';
import { PostTourDialog } from './post-tour-dialog';
import { TourSpotlight } from './tour-spotlight';
import { WelcomeDialog } from './welcome-dialog';

export function OnboardingManager() {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();

  const completeOnboarding = useSetAtom(completeOnboardingAtom);
  const initOnboarding = useSetAtom(initOnboardingAtom);

  const [phase, setPhase] = useAtom(onboardingPhaseAtom);
  const [tourStep, setTourStep] = useAtom(tourStepAtom);

  const hasCheckedFirstVisit = useRef(false);

  useEffect(() => {
    if (hasCheckedFirstVisit.current) return;
    hasCheckedFirstVisit.current = true;
    initOnboarding();
  }, [initOnboarding]);

  const startTour = () => {
    setTourStep(0);
    setPhase('tour');
  };

  const endOnboarding = () => {
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

  const handleAction = (href: string) => {
    setTourStep(Math.min(tourStep + 1, TOUR_STEPS.length - 1));
    setPhase('paused');
    push(href);
  };

  const handleResume = () => {
    setPhase('tour');
  };

  return (
    <>
      <WelcomeDialog
        open={phase === 'welcome'}
        onStart={startTour}
        onSkip={endOnboarding}
      />

      {phase === 'tour' && (
        <TourSpotlight
          steps={TOUR_STEPS}
          activeStep={tourStep}
          onNext={handleNext}
          onPrev={handlePrev}
          onSkip={endOnboarding}
          onAction={handleAction}
          readOnly={readOnlyMode}
        />
      )}

      <PostTourDialog
        open={phase === 'post_tour'}
        readOnly={readOnlyMode}
        onConfirm={() => {
          setPhase('idle');
          push(readOnlyMode ? '/agents' : '/agents/new');
        }}
        onDismiss={() => setPhase('idle')}
      />

      {phase === 'paused' && (
        <FloatingTourButton label="Resume tour" onClick={handleResume} />
      )}
    </>
  );
}
