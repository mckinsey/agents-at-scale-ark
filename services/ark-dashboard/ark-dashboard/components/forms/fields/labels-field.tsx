'use client';

import { type KeyboardEvent } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';

import { validateLabelDraft } from './label-validation';

interface LabelsFieldProps {
  value: string[];
  onChange: (labels: string[]) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onDraftTouched?: () => void;
  error?: string;
  disabled?: boolean;
  description?: string;
}

const DEFAULT_DESCRIPTION =
  'Labels group related resources. Letters and digits only.';

export function LabelsField({
  value,
  onChange,
  draft,
  onDraftChange,
  onDraftTouched,
  error,
  disabled,
  description = DEFAULT_DESCRIPTION,
}: Readonly<LabelsFieldProps>) {
  const addLabel = () => {
    const label = draft.trim();
    if (!label) {
      return;
    }
    if (validateLabelDraft(draft, value)) {
      onDraftTouched?.();
      return;
    }
    onChange([...value, label]);
    onDraftChange('');
  };

  const removeLabel = (label: string) => {
    onChange(value.filter(existing => existing !== label));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addLabel();
      return;
    }
    const last = value.at(-1);
    if (event.key === 'Backspace' && !draft && last !== undefined) {
      removeLabel(last);
    }
  };

  return (
    <>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(label => (
            <Tag
              key={label}
              variant="primary"
              size="sm"
              disabled={disabled}
              onRemove={() => removeLabel(label)}>
              {label}
            </Tag>
          ))}
        </div>
      )}
      <Input
        variant="inline"
        placeholder="Type a label and press Enter"
        value={draft}
        disabled={disabled}
        aria-invalid={!!error}
        onChange={event => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          addLabel();
          onDraftTouched?.();
        }}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldError>{error}</FieldError>
    </>
  );
}

export interface FormLabelsFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  labelsName: FieldPath<TFieldValues>;
  labelDraftName: FieldPath<TFieldValues>;
  disabled?: boolean;
}

export function FormLabelsField<TFieldValues extends FieldValues>({
  control,
  labelsName,
  labelDraftName,
  disabled,
}: Readonly<FormLabelsFieldProps<TFieldValues>>) {
  return (
    <FormField
      control={control}
      name={labelsName}
      render={({ field }) => (
        <FieldSet className="gap-2">
          <FieldTitle>Labels</FieldTitle>
          <FormField
            control={control}
            name={labelDraftName}
            render={({ field: draftField, fieldState }) => (
              <LabelsField
                value={field.value as string[]}
                onChange={field.onChange as (labels: string[]) => void}
                draft={draftField.value as string}
                onDraftChange={draftField.onChange as (draft: string) => void}
                onDraftTouched={draftField.onBlur}
                error={fieldState.error?.message}
                disabled={disabled}
              />
            )}
          />
        </FieldSet>
      )}
    />
  );
}
