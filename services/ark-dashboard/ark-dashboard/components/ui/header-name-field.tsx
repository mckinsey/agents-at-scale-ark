'use client';

import { Input } from '@/components/ui/input';

export interface HeaderNameFieldProps {
  readonly id: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly placeholder?: string;
  readonly onChange: (name: string) => void;
}

export function HeaderNameField({
  id,
  value,
  disabled,
  invalid,
  placeholder = 'Header-Name',
  onChange,
}: HeaderNameFieldProps) {
  return (
    <Input
      id={id}
      variant="inline"
      aria-label="Header name"
      aria-invalid={invalid}
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className="h-9 w-full min-w-0"
    />
  );
}
