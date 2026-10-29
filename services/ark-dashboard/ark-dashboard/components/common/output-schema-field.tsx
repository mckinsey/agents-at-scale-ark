'use client';

import { Code } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { Textarea } from '@/components/ui/textarea';
import {
  formatOutputSchema,
  validateOutputSchema,
} from '@/lib/utils/output-schema';

interface OutputSchemaFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly description?: string;
}

const PLACEHOLDER = `{
  "type": "object",
  "properties": {
    "answer": { "type": "string" }
  },
  "required": ["answer"],
  "additionalProperties": false
}`;

export function OutputSchemaField({
  value,
  onChange,
  disabled = false,
  description,
}: OutputSchemaFieldProps) {
  const error = validateOutputSchema(value);
  const canFormat = !disabled && !error && value.trim().length > 0;

  return (
    <FieldSet className="gap-2">
      <div className="flex items-center justify-between">
        <FieldTitle>Output Schema</FieldTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(formatOutputSchema(value))}
          disabled={!canFormat}
          className="h-8 gap-1 px-2">
          <IconShell size="sm" variant="secondary">
            <Code />
          </IconShell>
          Format
        </Button>
      </div>
      <Textarea
        aria-label="Output schema"
        aria-invalid={!!error}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        disabled={disabled}
        spellCheck={false}
        rows={10}
        className="font-mono text-xs"
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}
