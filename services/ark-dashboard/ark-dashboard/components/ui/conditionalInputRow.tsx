'use client';

import { SecretNameField } from '@/components/forms/fields/secret-name-field';
import { Trash } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Secret } from '@/lib/services';
import { cn } from '@/lib/utils';

import { Button } from './button';

type RowData = {
  name: string;
  type: 'direct' | 'secret';
  value: string;
  key: string;
  secretKey?: string;
};

interface ConditionalInputRowProps {
  data: RowData;
  onChange: (data: Partial<RowData>) => void;
  secrets: Secret[];
  isSecretsPending?: boolean;
  isSecretsError?: boolean;
  deleteRow: (key: string) => void;
  nameError?: string;
  valueError?: string;
  namePlaceholder?: string;
  valuePlaceholder?: string;
}

export function ConditionalInputRow({
  data,
  onChange,
  secrets,
  isSecretsPending,
  isSecretsError,
  deleteRow,
  nameError,
  valueError,
  namePlaceholder,
  valuePlaceholder,
}: ConditionalInputRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <Input
          id="name"
          variant="inline"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder={namePlaceholder}
          aria-invalid={!!nameError}
        />
        {nameError && (
          <p className="text-status-error mt-1 text-sm font-normal">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex-1">
        <Select
          value={data.type}
          onValueChange={value =>
            onChange({
              type: value as 'direct' | 'secret',
              value: '',
              secretKey: undefined,
            })
          }>
          <SelectTrigger id="type" className={cn(GHOST_TRIGGER, 'w-full')}>
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent className="bg-fill-onsurface-ui-2">
            <SelectItem value="direct">
              <SelectItemText>direct</SelectItemText>
            </SelectItem>
            <SelectItem value="secret">
              <SelectItemText>secret</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 flex-[2]">
        {data.type === 'direct' ? (
          <>
            <Input
              id="value"
              variant="inline"
              value={data.value}
              onChange={e => onChange({ value: e.target.value })}
              placeholder={valuePlaceholder}
              aria-invalid={!!valueError}
            />
            {valueError && (
              <p className="text-status-error mt-1 text-sm font-normal">
                {valueError}
              </p>
            )}
          </>
        ) : (
          <SecretNameField
            aria-label={data.name ? `Secret for ${data.name}` : 'Secret name'}
            value={data.value}
            onChange={value => onChange({ value, secretKey: undefined })}
            secrets={secrets}
            isPending={isSecretsPending}
            isError={isSecretsError}
            invalid={!!valueError}
            error={valueError}
          />
        )}
      </div>
      <Button
        type="button"
        onClick={() => deleteRow(data.key)}
        variant="ghost"
        size="icon-sm"
        aria-label="Delete header">
        <IconShell size="sm" variant="secondary">
          <Trash />
        </IconShell>
      </Button>
    </div>
  );
}
