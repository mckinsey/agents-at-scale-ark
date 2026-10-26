'use client';

import { useMemo } from 'react';

import {
  FLIP_COLLISION,
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface HeaderNameSelectProps {
  readonly id: string;
  readonly value: string;
  readonly options: string[];
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly onChange: (name: string) => void;
}

export function HeaderNameSelect({
  id,
  value,
  options,
  disabled,
  invalid,
  onChange,
}: HeaderNameSelectProps) {
  const items = useMemo(
    () => options.map(name => ({ value: name, label: name })),
    [options],
  );

  return (
    <Select
      items={items}
      value={value || null}
      onValueChange={next => onChange(String(next ?? ''))}
      disabled={disabled || items.length === 0}>
      <SelectTrigger
        id={id}
        aria-label="Header name"
        aria-invalid={invalid}
        className={cn(GHOST_TRIGGER, 'h-9 w-full min-w-0')}>
        <SelectValue
          placeholder={
            items.length === 0 ? 'No headers to override' : 'Select a header'
          }
        />
      </SelectTrigger>
      <SelectContent
        className="bg-fill-onsurface-ui-2"
        collisionAvoidance={FLIP_COLLISION}>
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>
            <SelectItemText>{item.label}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
