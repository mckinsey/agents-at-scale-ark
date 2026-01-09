'use client';

import { createContext, useContext } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { KeysOfUnion } from '@/lib/types/utils';

import type { FormValues } from './schema';

export type DisabledFields = Partial<Record<KeysOfUnion<FormValues>, boolean>>;

interface ModelConfigurationFormContext {
  formId: string;
  form: UseFormReturn<FormValues>;
  provider: FormValues['provider'];
  onSubmit: (formValues: FormValues) => void;
  isSubmitPending: boolean;
  disabledFields?: DisabledFields;
}

const ModelConfigurationFormContext = createContext<
  ModelConfigurationFormContext | undefined
>(undefined);

function useModelConfigurationForm() {
  const context = useContext(ModelConfigurationFormContext);
  if (!context) {
    throw new Error(
      'useModelConfigurationForm must be used within a ModelConfigurationFormProvider',
    );
  }

  return context;
}

export { useModelConfigurationForm, ModelConfigurationFormContext };
