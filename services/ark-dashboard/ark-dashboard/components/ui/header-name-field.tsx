'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

const inputClass =
  'text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50';

const underlineClass =
  'focus-within:border-b-stroke-status-focus flex h-10 min-w-0 items-center border-b border-white/[0.16]';

export interface HeaderNameFieldProps {
  readonly id: string;
  readonly value: string;
  readonly suggestions?: string[];
  readonly disabled?: boolean;
  readonly onChange: (name: string) => void;
  readonly className?: string;
}

export function HeaderNameField({
  id,
  value,
  suggestions = [],
  disabled,
  onChange,
  className,
}: HeaderNameFieldProps) {
  const listId = `${useId()}-header-names`;
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className={cn(underlineClass, className)}>
      <input
        id={id}
        type="text"
        aria-label="Header name"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Header-Name"
        disabled={disabled}
        autoComplete="off"
        list={hasSuggestions ? listId : undefined}
        className={inputClass}
      />
      {hasSuggestions && (
        <datalist id={listId}>
          {suggestions.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
