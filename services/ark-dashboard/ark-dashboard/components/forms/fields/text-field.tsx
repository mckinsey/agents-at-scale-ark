'use client';

import type { ReactNode } from 'react';
import type {
  Control,
  FieldPath,
  FieldValues,
} from 'react-hook-form';

import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { RequiredMarker } from '../resource-form-shell';

export interface FormTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label: ReactNode;
  placeholder?: string;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
  id?: string;
}

export function FormTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  placeholder,
  description,
  required,
  disabled,
  type,
  autoComplete,
  id,
}: Readonly<FormTextFieldProps<TFieldValues, TName>>) {
  const descriptionId = description && id ? `${id}-description` : undefined;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>
            {label} {required && <RequiredMarker />}
          </FieldTitle>
          <Input
            id={id}
            variant="inline"
            type={type}
            autoComplete={autoComplete}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!fieldState.error}
            aria-describedby={descriptionId}
            {...field}
          />
          {description && (
            <FieldDescription id={descriptionId}>
              {description}
            </FieldDescription>
          )}
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}
