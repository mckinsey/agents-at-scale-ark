import React from 'react';

import { cn } from '@/lib/utils';

interface CheckboxProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

function Checkbox({
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
        'border-border h-4 w-4 border',
        'hover:border-border-hover hover:bg-field-hover',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-primary',
        className,
      )}
      disabled={disabled}
    />
  );
}

export { Checkbox };
