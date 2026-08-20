'use client';

import { type KeyboardEvent } from 'react';

import { FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';

import { validateLabelDraft } from './types';

interface LabelsFieldProps {
  value: string[];
  onChange: (labels: string[]) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onDraftTouched?: () => void;
  error?: string;
  disabled?: boolean;
}

export function LabelsField({
  value,
  onChange,
  draft,
  onDraftChange,
  onDraftTouched,
  error,
  disabled,
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
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      removeLabel(value[value.length - 1]);
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
      <FieldDescription>
        Labels group related configurations. Letters, digits, &apos;-&apos;,
        &apos;_&apos; and &apos;.&apos; only.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </>
  );
}
