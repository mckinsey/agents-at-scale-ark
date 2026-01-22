'use client';

import { Trash2 } from 'lucide-react';
import React from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Secret } from '@/lib/services';

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
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <Input
          id="name"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="e.g., gpt-4-turbo"
          aria-invalid={!!nameError}
        />
        {nameError && (
          <p className="text-destructive mt-1 text-sm font-medium">
            {nameError}
          </p>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <Select
          value={data.type}
          onValueChange={value =>
            onChange({ type: value as 'direct' | 'secret', value: '' })
          }>
          <SelectTrigger id="type">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">direct</SelectItem>
            <SelectItem value="secret">secret</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div style={{ flex: 1 }}>
        {data.type === 'direct' ? (
          <>
            <Input
              id="value"
              value={data.value}
              onChange={e => onChange({ value: e.target.value })}
              placeholder="e.g., gpt-4-turbo"
              aria-invalid={!!valueError}
            />
            {valueError && (
              <p className="text-destructive mt-1 text-sm font-medium">
                {valueError}
              </p>
            )}
          </>
        ) : (
          <>
            <Select
              value={data.value}
              onValueChange={value => onChange({ value: value })}>
              <SelectTrigger id="thirdValue" aria-invalid={!!valueError}>
                <SelectValue placeholder="Select a secret" />
              </SelectTrigger>
              <SelectContent>
                {secrets.map(secret => (
                  <SelectItem key={secret.name} value={secret.name}>
                    {secret.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {valueError && (
              <p className="text-destructive mt-1 text-sm font-medium">
                {valueError}
              </p>
            )}
          </>
        )}
      </div>
      <Button
        type="button"
        onClick={() => deleteRow(data.key)}
        variant="outline"
        size="icon">
        <Trash2 className="h-2 w-2" />
      </Button>
    </div>
  );
}
