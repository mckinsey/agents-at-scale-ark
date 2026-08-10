'use client';

import { useState, type KeyboardEvent } from 'react';

import { FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';

import { labelSchema } from './types';

interface LabelsFieldProps {
  value: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
}

export function LabelsField({
  value,
  onChange,
  disabled,
}: Readonly<LabelsFieldProps>) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLabel = () => {
    const label = draft.trim();
    if (!label) {
      return;
    }
    if (value.includes(label)) {
      setError(`"${label}" has already been added`);
      return;
    }
    const parsed = labelSchema.safeParse(label);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    onChange([...value, label]);
    setDraft('');
    setError(null);
  };

  const removeLabel = (label: string) => {
    onChange(value.filter(existing => existing !== label));
    setError(null);
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
        onChange={event => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={addLabel}
      />
      <FieldDescription>
        Labels group related configurations. Letters, digits, &apos;-&apos;,
        &apos;_&apos; and &apos;.&apos; only.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </>
  );
}
