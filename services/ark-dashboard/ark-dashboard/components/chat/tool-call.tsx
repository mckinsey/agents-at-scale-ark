'use client';

import { useState } from 'react';

import { ChevronDown, ChevronRight, Handyman } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { cn } from '@/lib/utils';

export interface ToolCallData {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  result?: string;
}

interface ToolCallProps {
  toolCall: ToolCallData;
  variant?: 'card' | 'tree';
  className?: string;
}

interface ExpandableSectionProps {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  hasError: boolean;
  rawContent: string;
  parsedContent: Record<string, unknown> | null;
  additionalClasses?: string;
}

function ExpandableSection({
  label,
  isExpanded,
  onToggle,
  hasError,
  rawContent,
  parsedContent,
  additionalClasses = '',
}: ExpandableSectionProps) {
  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          'hover:bg-stateslayer-overlay-hover flex w-full items-center gap-2 px-2 py-1 text-left transition-colors',
          additionalClasses,
        )}>
        <IconShell size="sm">
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
        </IconShell>
        <span className="text-fg-secondary text-xs font-medium">{label}</span>
      </button>
      {isExpanded && (
        <div className="mt-1 pl-5">
          <pre className="text-fg-tertiary overflow-x-auto p-2 text-xs">
            {hasError ? rawContent : JSON.stringify(parsedContent, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}

interface VariantProps {
  toolCall: ToolCallData;
  className?: string;
  parsedArgs: Record<string, unknown> | null;
  parsedResult: Record<string, unknown> | null;
  parseArgsError: boolean;
  parseResultError: boolean;
}

function TreeVariant({
  toolCall,
  className,
  parsedArgs,
  parsedResult,
  parseArgsError,
  parseResultError,
}: VariantProps) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);

  return (
    <div className={cn('relative pl-6 text-sm', className)}>
      <div className="bg-stroke-divider absolute left-0 top-0 h-[18px] w-px"></div>
      <div className="bg-stroke-divider absolute left-0 top-[18px] h-px w-4"></div>
      <div className="flex items-center gap-2 py-1.5 pl-2">
        <IconShell size="sm" className="text-viz-categorical-08">
          <Handyman />
        </IconShell>
        <span className="text-fg-primary font-medium">
          {toolCall.function.name}
        </span>
      </div>

      <div className="mt-1 space-y-1 pl-2">
        <div className="relative">
          <div className="bg-stroke-divider absolute left-0 top-0 h-[14px] w-px"></div>
          <div className="bg-stroke-divider absolute left-0 top-[14px] h-px w-3"></div>
          <ExpandableSection
            label="Input"
            isExpanded={isInputExpanded}
            onToggle={() => setIsInputExpanded(!isInputExpanded)}
            hasError={parseArgsError}
            rawContent={toolCall.function.arguments}
            parsedContent={parsedArgs}
            additionalClasses="pl-4"
          />
        </div>

        {toolCall.result && (
          <div className="relative">
            <div className="bg-stroke-divider absolute left-0 top-0 h-[14px] w-px"></div>
            <div className="bg-stroke-divider absolute left-0 top-[14px] h-px w-3"></div>
            <ExpandableSection
              label="Output"
              isExpanded={isOutputExpanded}
              onToggle={() => setIsOutputExpanded(!isOutputExpanded)}
              hasError={parseResultError}
              rawContent={toolCall.result}
              parsedContent={parsedResult}
              additionalClasses="pl-4"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CardVariant({
  toolCall,
  className,
  parsedArgs,
  parsedResult,
  parseArgsError,
  parseResultError,
}: VariantProps) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);

  return (
    <div
      className={cn(
        'bg-surface-bg-secondary border-stroke-divider border p-3 text-sm',
        className,
      )}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <IconShell size="sm" className="text-viz-categorical-08">
          <Handyman />
        </IconShell>
        <span className="text-fg-primary font-medium">
          {toolCall.function.name}
        </span>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <button
            onClick={() => setIsInputExpanded(!isInputExpanded)}
            className="hover:bg-stateslayer-overlay-hover flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors">
            <IconShell size="sm">
              {isInputExpanded ? <ChevronDown /> : <ChevronRight />}
            </IconShell>
            <span className="text-fg-secondary text-xs font-medium">Input</span>
          </button>
          {isInputExpanded && (
            <div className="mt-1 px-2">
              <pre className="bg-surface-bg-tertiary text-fg-tertiary overflow-x-auto p-2 text-xs">
                {parseArgsError
                  ? toolCall.function.arguments
                  : JSON.stringify(parsedArgs, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {toolCall.result && (
          <div>
            <button
              onClick={() => setIsOutputExpanded(!isOutputExpanded)}
              className="hover:bg-stateslayer-overlay-hover flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors">
              <IconShell size="sm">
                {isOutputExpanded ? <ChevronDown /> : <ChevronRight />}
              </IconShell>
              <span className="text-fg-secondary text-xs font-medium">
                Output
              </span>
            </button>
            {isOutputExpanded && (
              <div className="mt-1 px-2">
                <pre className="bg-surface-bg-tertiary text-fg-tertiary overflow-x-auto p-2 text-xs">
                  {parseResultError
                    ? toolCall.result
                    : JSON.stringify(parsedResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolCall({
  toolCall,
  variant = 'card',
  className,
}: Readonly<ToolCallProps>) {
  let parsedArgs: Record<string, unknown> | null = null;
  let parseArgsError = false;

  try {
    parsedArgs = JSON.parse(toolCall.function.arguments) as Record<
      string,
      unknown
    >;
  } catch {
    parseArgsError = true;
  }

  let parsedResult: Record<string, unknown> | null = null;
  let parseResultError = false;

  if (toolCall.result) {
    try {
      parsedResult = JSON.parse(toolCall.result) as Record<string, unknown>;
    } catch {
      parseResultError = true;
    }
  }

  const variantProps: VariantProps = {
    toolCall,
    className,
    parsedArgs,
    parsedResult,
    parseArgsError,
    parseResultError,
  };

  if (variant === 'tree') {
    return <TreeVariant {...variantProps} />;
  }

  return <CardVariant {...variantProps} />;
}
