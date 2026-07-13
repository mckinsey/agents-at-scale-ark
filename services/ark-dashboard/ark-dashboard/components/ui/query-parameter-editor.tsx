'use client';

import { useMemo } from 'react';

import { Add, Code, Info, SmartToy, Trash, Warning } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  type QueryParameter,
  extractTemplateParameters,
} from '@/lib/utils/query-parameters';
import { generateUUID } from '@/lib/utils/uuid';

import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface QueryParameterEditorProps {
  parameters: QueryParameter[];
  onChange: (parameters: QueryParameter[]) => void;
  inputText?: string;
  disabled?: boolean;
  className?: string;
  agentRequiredParams?: string[];
}

const VARIABLES_TOOLTIP_TEXT =
  'Use {{.parameterName}} in your input to add variables. Values are substituted at query time.';

export function QueryParameterEditor({
  parameters,
  onChange,
  inputText = '',
  disabled,
  className,
  agentRequiredParams = [],
}: QueryParameterEditorProps) {
  const inputParams = useMemo(
    () => extractTemplateParameters(inputText),
    [inputText],
  );
  const definedParamNames = new Set(
    parameters.map(p => p.name).filter(Boolean),
  );

  const undefinedInputParams = inputParams.filter(
    p => !definedParamNames.has(p),
  );

  const undefinedAgentParams = agentRequiredParams.filter(
    p => !definedParamNames.has(p),
  );

  const addParameter = (name = '') => {
    onChange([...parameters, { id: generateUUID(), name, value: '' }]);
  };

  const removeParameter = (index: number) => {
    onChange(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, updates: Partial<QueryParameter>) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], ...updates };
    onChange(newParams);
  };

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex w-full items-start justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-fg-secondary text-base leading-6 tracking-[-0.016px]">
              Variables
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How to use variables"
                  className="text-fg-secondary inline-flex cursor-help">
                  <Info className="size-4" />
                </button>
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
          onClick={() => addParameter()}
          disabled={disabled}>
          <Add className="size-4" />
          Add new
        </Button>
      </div>

      {undefinedAgentParams.length > 0 && (
        <div className="bg-status-info/10 rounded-md p-3">
          <div className="flex items-start gap-2">
            <SmartToy className="text-status-info mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="text-status-info text-xs font-medium">
                Required by agent:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {undefinedAgentParams.map(param => (
                  <button
                    key={param}
                    type="button"
                    onClick={() => addParameter(param)}
                    disabled={disabled}
                    className="bg-status-info/20 text-status-info hover:bg-status-info/30 inline-flex items-center rounded px-2 py-0.5 font-mono text-xs transition-colors disabled:cursor-not-allowed">
                    {param}
                    <Add className="ml-1 size-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {undefinedInputParams.length > 0 && (
        <div className="bg-status-warning/10 rounded-md p-3">
          <div className="flex items-start gap-2">
            <Warning className="text-status-warning mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="text-status-warning text-xs font-medium">
                Undefined in input:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {undefinedInputParams.map(param => (
                  <button
                    key={param}
                    type="button"
                    onClick={() => addParameter(param)}
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
      )}

      {parameters.length > 0 && (
        <div className="flex flex-col gap-2">
          {parameters.map((param, index) => {
            const isUsedInInput =
              !!param.name && inputParams.includes(param.name);
            const isRequiredByAgent =
              !!param.name && agentRequiredParams.includes(param.name);
            const isDuplicate =
              !!param.name &&
              parameters.filter(p => p.name === param.name).length > 1;

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
                      'text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent font-mono text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50',
                      isDuplicate &&
                        'text-status-error placeholder:text-status-error',
                    )}
                  />
                  {isUsedInInput && (
                    <span
                      className="text-status-success inline-flex shrink-0 items-center"
                      title="Used in input text">
                      <Code className="size-3.5" />
                    </span>
                  )}
                  {isRequiredByAgent && (
                    <span
                      className="text-status-info inline-flex shrink-0 items-center"
                      title="Required by agent">
                      <SmartToy className="size-3.5" />
                    </span>
                  )}
                </div>
                <div className="focus-within:border-b-stroke-status-focus flex h-10 min-w-0 flex-1 items-center border-b border-white/[0.16]">
                  <input
                    type="text"
                    value={param.value}
                    onChange={e =>
                      updateParameter(index, { value: e.target.value })
                    }
                    placeholder="Value"
                    disabled={disabled}
                    aria-label={`Parameter ${index + 1} value`}
                    className="text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
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
      )}
    </div>
  );
}
