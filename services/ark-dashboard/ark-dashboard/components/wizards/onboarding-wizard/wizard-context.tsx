'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useContext, useState } from 'react';

export type WizardStep = 'model' | 'agent' | 'finish';

type WizardState = {
  currentStep: WizardStep;
  skipModelStep: boolean;
  createdModelName: string | null;
  createdAgentName: string | null;
};

type WizardContextType = {
  state: WizardState;
  setCurrentStep: (step: WizardStep) => void;
  setSkipModelStep: (skip: boolean) => void;
  setCreatedModelName: (name: string | null) => void;
  setCreatedAgentName: (name: string | null) => void;
  reset: () => void;
};

const defaultState: WizardState = {
  currentStep: 'model',
  skipModelStep: false,
  createdModelName: null,
  createdAgentName: null,
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<WizardState>(defaultState);

  const setCurrentStep = (step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  };

  const setSkipModelStep = (skip: boolean) => {
    setState(prev => ({ ...prev, skipModelStep: skip }));
  };

  const setCreatedModelName = (name: string | null) => {
    setState(prev => ({ ...prev, createdModelName: name }));
  };

  const setCreatedAgentName = (name: string | null) => {
    setState(prev => ({ ...prev, createdAgentName: name }));
  };

  const reset = () => {
    setState(defaultState);
  };

  return (
    <WizardContext.Provider
      value={{
        state,
        setCurrentStep,
        setSkipModelStep,
        setCreatedModelName,
        setCreatedAgentName,
        reset,
      }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}
