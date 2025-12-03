import React from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  className,
  disabled,
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onCheckedChange?.(e.target.checked)}
      className={cn(
        'h-4 w-4 rounded border border-border bg-input',
        'hover:border-border-hover hover:bg-field-hover',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-primary',
        className,
      )}
      disabled={disabled}
    />
  );
}
