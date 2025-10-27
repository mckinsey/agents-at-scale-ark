"use client";

import {
  createContext,
  useContext
} from "react";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "./schema";
import { KeysOfUnion } from "@/lib/types/utils";

export type DisabledFields = Partial<Record<KeysOfUnion<FormValues>, boolean>>

interface ModelConfigurationFormContext {
  formId: string;
  form: UseFormReturn<FormValues>
  type: FormValues['type']
  onSubmit: (formValues: FormValues) => void
  isSubmitPending: boolean
  disabledFields?: DisabledFields
}

const ModelConfigurationFormContext = createContext<ModelConfigurationFormContext | undefined>(undefined);

function useModelConfigurationForm() {
  const context = useContext(ModelConfigurationFormContext);
  if (!context) {
    throw new Error("useModelConfigurationForm must be used within a ModelConfigurationFormProvider");
  }

  return context;
}

export { useModelConfigurationForm, ModelConfigurationFormContext };
