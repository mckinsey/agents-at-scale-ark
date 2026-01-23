'use client';

import { useAtom, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  onboardingWizardOpenAtom,
  storedOnboardingCompletedAtom,
} from '@/atoms/onboarding';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGetAllModels } from '@/lib/services/models-hooks';

import { DEFAULT_MODEL_NAME } from './constants';
import { AgentStep } from './steps/agent-step';
import { FinishStep } from './steps/finish-step';
import { ModelStep } from './steps/model-step';
import type { WizardStep } from './wizard-context';
import { WizardProvider, useWizard } from './wizard-context';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'model', label: 'Model' },
  { key: 'agent', label: 'Agent' },
  { key: 'finish', label: 'Finish' },
];

function StepIndicator({
  currentStep,
  skipModelStep,
}: {
  currentStep: WizardStep;
  skipModelStep: boolean;
}) {
  const visibleSteps = skipModelStep
    ? STEPS.filter(s => s.key !== 'model')
    : STEPS;

  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {visibleSteps.map((step, index) => {
        const isActive = step.key === currentStep;
        const currentIndex = visibleSteps.findIndex(s => s.key === currentStep);
        const isPast = index < currentIndex;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPast
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}>
                {index + 1}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'font-medium' : 'text-muted-foreground'
                }`}>
                {step.label}
              </span>
            </div>
            {index < visibleSteps.length - 1 && (
              <div
                className={`mx-4 h-0.5 w-8 ${
                  isPast ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WizardContent() {
  const { state, setCurrentStep, setSkipModelStep, setCreatedModelName } =
    useWizard();
  const { data: models, isSuccess: modelsLoaded } = useGetAllModels();

  useEffect(() => {
    if (modelsLoaded) {
      const hasDefaultModel = models?.some(
        model => model.name === DEFAULT_MODEL_NAME,
      );
      if (hasDefaultModel) {
        setSkipModelStep(true);
        setCreatedModelName(DEFAULT_MODEL_NAME);
        if (state.currentStep === 'model') {
          setCurrentStep('agent');
        }
      }
    }
  }, [
    modelsLoaded,
    models,
    state.currentStep,
    setSkipModelStep,
    setCreatedModelName,
    setCurrentStep,
  ]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Welcome to Ark</DialogTitle>
        <DialogDescription>
          Let&apos;s set up your first AI agent in a few steps.
        </DialogDescription>
      </DialogHeader>

      <StepIndicator
        currentStep={state.currentStep}
        skipModelStep={state.skipModelStep}
      />

      {state.currentStep === 'model' && <ModelStep />}
      {state.currentStep === 'agent' && <AgentStep />}
      {state.currentStep === 'finish' && <FinishStep />}
    </>
  );
}

export function OnboardingWizard() {
  const [isOpen, setIsOpen] = useAtom(onboardingWizardOpenAtom);
  const setOnboardingCompleted = useSetAtom(storedOnboardingCompletedAtom);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setOnboardingCompleted(true);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={true}>
        <WizardProvider>
          <WizardContent />
        </WizardProvider>
      </DialogContent>
    </Dialog>
  );
}
