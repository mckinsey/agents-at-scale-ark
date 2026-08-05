'use client';

import { type KeyboardEvent, useId, useState } from 'react';

import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { getLabelError } from '@/lib/utils/label-validation';

export interface LabelsFieldProps {
  readonly value: readonly string[];
  readonly onChange: (labels: string[]) => void;
  readonly label?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly error?: string;
}

export function LabelsField({
  value,
  onChange,
  label = 'Labels',
  placeholder = 'e.g., production',
  disabled = false,
  error,
}: LabelsFieldProps) {
  const errorId = useId();
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const commitDraft = () => {
    const candidate = draft.trim();
    if (!candidate) return;

    const validationError = getLabelError(candidate);
    if (validationError) {
      setDraftError(validationError);
      return;
    }

    if (value.includes(candidate)) {
      setDraftError('Label already added');
      return;
    }

    onChange([...value, candidate]);
    setDraft('');
    setDraftError(null);
  };

  const removeLabel = (candidate: string) => {
    onChange(value.filter(item => item !== candidate));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeLabel(value[value.length - 1]);
    }
  };

  const visibleError = draftError ?? error;

  return (
    <FieldSet className="gap-2">
      <FieldTitle>{label}</FieldTitle>
      <Input
        variant="inline"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        aria-invalid={!!visibleError}
        aria-describedby={visibleError ? errorId : undefined}
        onChange={event => {
          setDraft(event.target.value);
          setDraftError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map(item => (
            <Tag
              key={item}
              size="xs"
              disabled={disabled}
              onRemove={() => removeLabel(item)}>
              {item}
            </Tag>
          ))}
        </div>
      )}
      <FieldDescription>
        Optional. Press Enter to add a label — letters and numbers only
      </FieldDescription>
      <FieldError id={errorId}>{visibleError}</FieldError>
    </FieldSet>
  );
}
