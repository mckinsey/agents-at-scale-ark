'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  onboardingCompletedAtom,
  onboardingWizardOpenAtom,
} from '@/atoms/onboarding';
import { useGetAllAgents } from '@/lib/services/agents-hooks';
import { useGetAllModels } from '@/lib/services/models-hooks';

export function OnboardingTrigger() {
  const { data: models, isSuccess: modelsLoaded } = useGetAllModels();
  const { data: agents, isSuccess: agentsLoaded } = useGetAllAgents();
  const onboardingCompleted = useAtomValue(onboardingCompletedAtom);
  const setWizardOpen = useSetAtom(onboardingWizardOpenAtom);

  useEffect(() => {
    if (modelsLoaded && agentsLoaded && !onboardingCompleted) {
      const hasNoModels = !models || models.length === 0;
      const hasNoAgents = !agents || agents.length === 0;

      if (hasNoModels && hasNoAgents) {
        setWizardOpen(true);
      }
    }
  }, [
    modelsLoaded,
    agentsLoaded,
    models,
    agents,
    onboardingCompleted,
    setWizardOpen,
  ]);

  return null;
}
