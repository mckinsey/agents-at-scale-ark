'use client';

import { useState } from 'react';

import { CollapseContent, ExpandContent } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { PromptEditor } from '@/components/ui/prompt-editor';
import { cn } from '@/lib/utils';

interface PromptFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly hasError: boolean;
  readonly disabled: boolean;
  readonly parameters: Array<{ name: string }>;
  readonly required?: boolean;
}

export function PromptField({
  value,
  onChange,
  error,
  hasError,
  disabled,
  parameters,
  required = false,
}: PromptFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <FieldSet className="gap-2">
      <div className="flex items-center justify-between">
        <FieldTitle>
          Prompt
          {required && (
            <span aria-hidden="true" className="text-fg-secondary">
              {' '}
              *
            </span>
          )}
        </FieldTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 gap-1 px-2">
          <IconShell size="sm" variant="secondary">
            {isExpanded ? <CollapseContent /> : <ExpandContent />}
          </IconShell>
          {isExpanded ? 'Collapse' : 'Expand'}
        </Button>
      </div>
      <PromptEditor
        variant="compact"
        showSublabel={false}
        showFooter={false}
        value={value}
        onChange={onChange}
        placeholder="Hint the agent objective here..."
        disabled={disabled}
        parameters={parameters}
        className={cn(
          'border-stroke-divider focus-within:border-stroke-status-focus border bg-transparent pb-3 transition-all duration-200',
          isExpanded ? 'min-h-[560px]' : 'min-h-[248px]',
          hasError && 'border-status-error',
        )}
      />
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}
