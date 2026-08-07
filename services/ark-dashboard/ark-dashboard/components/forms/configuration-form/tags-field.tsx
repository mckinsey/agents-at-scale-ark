'use client';

import { useState, type KeyboardEvent } from 'react';

import { FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';

import { tagSchema } from './types';

interface TagsFieldProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagsField({
  value,
  onChange,
  disabled,
}: Readonly<TagsFieldProps>) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const tag = draft.trim();
    if (!tag) {
      return;
    }
    if (value.includes(tag)) {
      setError(`"${tag}" has already been added`);
      return;
    }
    const parsed = tagSchema.safeParse(tag);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    onChange([...value, tag]);
    setDraft('');
    setError(null);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(existing => existing !== tag));
    setError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
      return;
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(tag => (
            <Tag
              key={tag}
              variant="primary"
              size="sm"
              disabled={disabled}
              onRemove={() => removeTag(tag)}>
              {tag}
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
        onBlur={addTag}
      />
      <FieldDescription>
        Labels group related configurations. Letters, digits, &apos;-&apos;,
        &apos;_&apos; and &apos;.&apos; only.
      </FieldDescription>
      <FieldError>{error}</FieldError>
    </>
  );
}
