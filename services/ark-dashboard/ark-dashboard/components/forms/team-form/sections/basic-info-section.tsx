import type { UseFormReturn } from 'react-hook-form';

import {
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { TeamFormMode } from '../types';
import type { TeamFormValues } from '../use-team-form';

interface BasicInfoSectionProps {
  form: UseFormReturn<TeamFormValues>;
  mode: TeamFormMode;
  disabled?: boolean;
}

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export function BasicInfoSection({
  form,
  mode,
  disabled,
}: Readonly<BasicInfoSectionProps>) {
  const isViewing = mode === TeamFormMode.VIEW;

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>
              Name {!isViewing && <RequiredMarker />}
            </FieldTitle>
            <Input
              variant="inline"
              placeholder="e.g., engineering-team"
              disabled={isViewing || disabled}
              aria-invalid={!!fieldState.error}
              {...field}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <FieldSet className="gap-2">
            <FieldTitle>Description</FieldTitle>
            <Input
              variant="inline"
              placeholder="e.g., Core development and infrastructure team"
              disabled={disabled}
              aria-invalid={!!fieldState.error}
              {...field}
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldSet>
        )}
      />
    </>
  );
}
