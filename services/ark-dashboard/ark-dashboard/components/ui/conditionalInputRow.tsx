'use client';

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
};

interface ConditionalInputRowProps {
  data: RowData;
  onChange: (data: Partial<RowData>) => void;
  secrets: Secret[];
  deleteRow: (key: string) => void;
  nameError?: string;
  valueError?: string;
}

export function ConditionalInputRow({
  data,
  onChange,
  secrets,
  deleteRow,
  nameError,
  valueError,
}: ConditionalInputRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <Input
          id="name"
          variant="inline"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="e.g., gpt-4-turbo"
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
            onChange({ type: value as 'direct' | 'secret', value: '' })
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
      <div className="flex-1">
        {data.type === 'direct' ? (
          <>
            <Input
              id="value"
              variant="inline"
              value={data.value}
              onChange={e => onChange({ value: e.target.value })}
              placeholder="e.g., gpt-4-turbo"
              aria-invalid={!!valueError}
            />
            {valueError && (
              <p className="text-status-error mt-1 text-sm font-normal">
                {valueError}
              </p>
            )}
          </>
        ) : (
          <>
            <Select
              value={data.value}
              onValueChange={value => onChange({ value: value as string })}>
              <SelectTrigger
                id="thirdValue"
                className={cn(GHOST_TRIGGER, 'w-full')}
                aria-invalid={!!valueError}>
                <SelectValue placeholder="Select a secret" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {secrets.map(secret => (
                  <SelectItem key={secret.name} value={secret.name}>
                    <SelectItemText>{secret.name}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {valueError && (
              <p className="text-status-error mt-1 text-sm font-normal">
                {valueError}
              </p>
            )}
          </>
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
