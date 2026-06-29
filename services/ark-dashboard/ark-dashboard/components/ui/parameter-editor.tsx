'use client';

import { useMemo } from 'react';

import { Add, Info, Lock, Trash, Warning } from '@/components/icons';
import { cn } from '@/lib/utils';
import { generateUUID } from '@/lib/utils/uuid';

import { Button } from './button';
import { ScrollArea } from './scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export type ParameterSource =
  | 'value'
  | 'queryParameter'
  | 'configMapKeyRef'
  | 'secretKeyRef';

export interface Parameter {
  id: string;
  name: string;
  source: ParameterSource;
  value?: string;
  queryParameterName?: string;
  overrideQueryName?: boolean;
  configMapRef?: { name: string; key: string };
  secretRef?: { name: string; key: string };
}

export interface ParameterEditorProps {
  parameters: Parameter[];
  onChange: (parameters: Parameter[]) => void;
  prompt?: string;
  disabled?: boolean;
  className?: string;
  compactRowsClassName?: string;
}

const TEMPLATE_REGEX = /\{\{\s*\.([\w]+)\s*\}\}/g;

const VARIABLES_TOOLTIP_TEXT =
  'Use {{.parameterName}} to add variables. Example: You are a {{.role}} assistant for {{.company}}. Environment: {{.environment}}';

function extractPromptParameters(prompt: string): string[] {
  const matches = prompt.matchAll(TEMPLATE_REGEX);
  const params = new Set<string>();
  for (const match of matches) {
    params.add(match[1]);
  }
  return Array.from(params);
}

export function ParameterEditor({
  parameters,
  onChange,
  prompt = '',
  disabled,
  className,
  compactRowsClassName,
}: Readonly<ParameterEditorProps>) {
  const promptParams = useMemo(() => extractPromptParameters(prompt), [prompt]);
  const definedParamNames = new Set(
    parameters.map(p => p.name).filter(Boolean),
  );

  const undefinedParams = promptParams.filter(p => !definedParamNames.has(p));

  const addParameter = (
    name = '',
    source: ParameterSource = 'queryParameter',
  ) => {
    onChange([
      ...parameters,
      {
        id: generateUUID(),
        name,
        source,
        value: '',
        queryParameterName: '',
        overrideQueryName: false,
      },
    ]);
  };

  const removeParameter = (index: number) => {
    onChange(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, updates: Partial<Parameter>) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], ...updates };
    onChange(newParams);
  };

  const undefinedParamsWarning =
    undefinedParams.length > 0 ? (
      <div className="border-status-warning/30 bg-status-warning/10 rounded-md border p-3">
        <div className="flex items-start gap-2">
          <Warning className="text-status-warning mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="text-status-warning text-xs font-medium">
              Undefined parameters in prompt:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {undefinedParams.map(param => (
                <button
                  key={param}
                  type="button"
                  onClick={() => addParameter(param, 'value')}
                  disabled={disabled}
                  className="bg-status-warning/20 text-status-warning hover:bg-status-warning/30 inline-flex items-center rounded px-2 py-0.5 font-mono text-xs transition-colors disabled:cursor-not-allowed">
                  {'{{.'}
                  {param}
                  {'}}'}
                  <Add className="ml-1 size-3" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const compactParameterRows =
    parameters.length > 0 ? (
      <div className="flex flex-col gap-2">
        {parameters.map((param, index) => {
          const isDuplicate =
            !!param.name &&
            parameters.filter(p => p.name === param.name).length > 1;
          const isUnsupportedSource =
            param.source === 'configMapKeyRef' ||
            param.source === 'secretKeyRef';
          // Query parameters get their values when chatting, not here, so they
          // are shown read-only: the name is fixed and there is no delete
          // action. They stay in `parameters` and are preserved on save.
          const isQueryParameter = param.source === 'queryParameter';

          if (isQueryParameter) {
            return (
              <div
                key={param.id}
                className="flex h-10 items-center gap-2 border-b border-white/[0.16]">
                <span className="text-fg-primary min-w-0 flex-1 truncate text-sm leading-4 tracking-[-0.112px]">
                  {param.name || (
                    <span className="text-fg-tertiary">Unnamed variable</span>
                  )}
                </span>
                <span
                  className="text-fg-tertiary inline-flex shrink-0 items-center gap-1 text-xs"
                  title="This value is set when chatting with the agent">
                  <Lock className="size-3 shrink-0" />
                  Set in chat
                </span>
              </div>
            );
          }

          // Direct-value variables behave like they did on main: an editable
          // name plus a "Value" input. A non-empty value is required by the
          // agent webhook (a value param with no value is invalid).
          const isValueSource = param.source === 'value';

          return (
            <div key={param.id} className="flex items-center gap-3">
              <div className="focus-within:border-b-stroke-status-focus flex h-10 min-w-0 flex-1 items-center gap-2 border-b border-white/[0.16]">
                <input
                  type="text"
                  value={param.name}
                  onChange={e =>
                    updateParameter(index, { name: e.target.value })
                  }
                  placeholder="parameter_name"
                  disabled={disabled}
                  aria-label={`Parameter ${index + 1} name`}
                  className={cn(
                    'text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50',
                    isDuplicate &&
                      'text-status-error placeholder:text-status-error',
                  )}
                />
                {isUnsupportedSource && (
                  <span
                    className="text-status-warning inline-flex items-center gap-1 text-xs"
                    title={
                      param.source === 'configMapKeyRef'
                        ? `ConfigMap: ${param.configMapRef?.name || '?'}/${param.configMapRef?.key || '?'}`
                        : `Secret: ${param.secretRef?.name || '?'}/${param.secretRef?.key || '?'}`
                    }>
                    <Lock className="size-3 shrink-0" />
                    {param.source === 'configMapKeyRef' ? 'ConfigMap' : 'Secret'}
                  </span>
                )}
              </div>
              {isValueSource && (
                <div className="focus-within:border-b-stroke-status-focus flex h-10 min-w-0 flex-1 items-center border-b border-white/[0.16]">
                  <input
                    type="text"
                    value={param.value || ''}
                    onChange={e =>
                      updateParameter(index, { value: e.target.value })
                    }
                    placeholder="Value"
                    disabled={disabled}
                    aria-label={`Parameter ${index + 1} value`}
                    className="text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              )}
              <div className="flex h-10 w-8 shrink-0 items-center justify-center border-b border-white/[0.16]">
                <button
                  type="button"
                  onClick={() => removeParameter(index)}
                  disabled={disabled}
                  aria-label="Remove parameter"
                  className="text-fg-secondary hover:text-status-error transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Header — figma 4257:32443 */}
      <div className="flex w-full items-start justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-fg-secondary text-base leading-6 tracking-[-0.016px]">
              Variables
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label="How to use variables"
                  className="text-fg-secondary inline-flex cursor-help">
                  <Info className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{VARIABLES_TOOLTIP_TEXT}</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-fg-secondary text-xs leading-4 tracking-[0.024px]">
            {parameters.length} result{parameters.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => addParameter('', 'value')}
          disabled={disabled}>
          <Add className="size-4" />
          Add new
        </Button>
      </div>

      {undefinedParamsWarning}

      {compactRowsClassName && parameters.length > 0 ? (
        <ScrollArea className={compactRowsClassName}>
          {compactParameterRows}
        </ScrollArea>
      ) : (
        compactParameterRows
      )}
    </div>
  );
}
