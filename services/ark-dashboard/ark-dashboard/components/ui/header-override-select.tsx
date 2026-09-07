'use client';

import { useMemo } from 'react';

import { Warning } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { LabeledField } from '@/components/ui/labeled-field';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type McpSecretOption,
  secretOptionValue,
} from '@/lib/hooks/use-mcp-secret-options';
import { cn } from '@/lib/utils';

export const ADVANCED_OPTION_VALUE = '__advanced__';

const ADVANCED_OPTION_LABEL = 'Advanced…';

export interface HeaderOverrideSelectProps {
  readonly id: string;
  readonly options: McpSecretOption[];
  readonly loaded: boolean;
  readonly secretName: string;
  readonly secretKey: string;
  readonly disabled?: boolean;
  readonly onSelectSecret: (secretName: string, secretKey: string) => void;
  readonly onSelectAdvanced: () => void;
  readonly className?: string;
  readonly hideLabel?: boolean;
}

export function HeaderOverrideSelect({
  id,
  options,
  loaded,
  secretName,
  secretKey,
  disabled,
  onSelectSecret,
  onSelectAdvanced,
  className,
  hideLabel,
}: HeaderOverrideSelectProps) {
  const items = useMemo(
    () => [
      ...options.map(option => ({
        value: option.value,
        label: option.label,
      })),
      { value: ADVANCED_OPTION_VALUE, label: ADVANCED_OPTION_LABEL },
    ],
    [options],
  );

  const currentValue = secretOptionValue(secretName, secretKey);
  const isKnown = options.some(option => option.value === currentValue);
  const hasSelection = !!secretName && !!secretKey;
  const isMissing = loaded && hasSelection && !isKnown;

  const handleChange = (next: string) => {
    if (next === ADVANCED_OPTION_VALUE) {
      onSelectAdvanced();
      return;
    }
    const option = options.find(item => item.value === next);
    if (option) onSelectSecret(option.secretName, option.secretKey);
  };

  const body = (
    <>
      <Select
        items={items}
        value={isKnown ? currentValue : undefined}
        onValueChange={value => handleChange(String(value))}
        disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-label={hideLabel ? 'Header override' : undefined}
          className={cn(GHOST_TRIGGER, 'h-10 w-full min-w-0')}>
          <SelectValue placeholder="Select a secret" />
        </SelectTrigger>
        <SelectContent className="bg-fill-onsurface-ui-2">
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
    </>
  );

  if (hideLabel) {
    return (
      <div className={cn('flex min-w-0 flex-col gap-1', className)}>{body}</div>
    );
  }

  return (
    <LabeledField id={id} label="Header override" className={className}>
      {body}
    </LabeledField>
  );
}
