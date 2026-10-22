'use client';

import { useMemo } from 'react';

import { Warning } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
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
import {
  type SecretKeyOption,
  secretOptionValue,
} from '@/lib/hooks/use-secret-key-options';
import { cn } from '@/lib/utils';

export interface HeaderOverrideSelectProps {
  readonly id: string;
  readonly options: SecretKeyOption[];
  readonly loaded: boolean;
  readonly secretName: string;
  readonly secretKey: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly onSelectSecret: (secretName: string, secretKey: string) => void;
}

export function HeaderOverrideSelect({
  id,
  options,
  loaded,
  secretName,
  secretKey,
  disabled,
  invalid,
  onSelectSecret,
}: HeaderOverrideSelectProps) {
  const items = useMemo(
    () => options.map(option => ({ value: option.value, label: option.label })),
    [options],
  );

  const currentValue = secretOptionValue(secretName, secretKey);
  const isKnown = options.some(option => option.value === currentValue);
  const hasSelection = !!secretName && !!secretKey;
  const isMissing = loaded && hasSelection && !isKnown;

  const handleChange = (next: string) => {
    const option = options.find(item => item.value === next);
    if (option) onSelectSecret(option.secretName, option.secretKey);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        items={items}
        value={isKnown ? currentValue : undefined}
        onValueChange={value => handleChange(String(value))}
        disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-label="Header override"
          aria-invalid={invalid}
          className={cn(GHOST_TRIGGER, 'h-9 w-full min-w-0')}>
          <SelectValue placeholder="Select a secret" />
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

      {isMissing && (
        <span className="text-status-error inline-flex items-center gap-1 text-xs">
          <IconShell size="sm" className="text-status-error">
            <Warning />
          </IconShell>
          {secretName}/{secretKey} is not available in this namespace
        </span>
      )}

      {loaded && options.length === 0 && (
        <span className="text-fg-tertiary text-xs">
          No secrets in this namespace yet.
        </span>
      )}
    </div>
  );
}
