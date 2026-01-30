'use client';

import {
  AlertTriangle,
  Bot,
  FileText,
  Plus,
  Trash2,
  Variable,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import {
  type QueryParameter,
  extractTemplateParameters,
} from '@/lib/utils/query-parameters';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

export interface QueryParameterEditorProps {
  parameters: QueryParameter[];
  onChange: (parameters: QueryParameter[]) => void;
  inputText?: string;
  disabled?: boolean;
  className?: string;
  agentRequiredParams?: string[];
}

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
    onChange([...parameters, { name, value: '' }]);
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
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Variable className="text-muted-foreground h-4 w-4" />
          <h3 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            Parameters
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addParameter()}
          disabled={disabled}
          className="h-7 px-2 text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>

      {/* Agent-required params suggestion */}
      {undefinedAgentParams.length > 0 && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="flex items-start gap-2">
            <Bot className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="flex-1">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                Required by agent:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {undefinedAgentParams.map(param => (
                  <button
                    key={param}
                    type="button"
                    onClick={() => addParameter(param)}
                    disabled={disabled}
                    className="inline-flex items-center rounded bg-blue-500/20 px-2 py-0.5 font-mono text-xs text-blue-700 transition-colors hover:bg-blue-500/30 disabled:cursor-not-allowed dark:text-blue-400">
                    {param}
                    <Plus className="ml-1 h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Undefined input params warning */}
      {undefinedInputParams.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Undefined in input:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {undefinedInputParams.map(param => (
                  <button
                    key={param}
                    type="button"
                    onClick={() => addParameter(param)}
                    disabled={disabled}
                    className="inline-flex items-center rounded bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-700 transition-colors hover:bg-amber-500/30 disabled:cursor-not-allowed dark:text-amber-400">
                    {'{{.'}
                    {param}
                    {'}}'}
                    <Plus className="ml-1 h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {parameters.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-xs">
            No parameters defined. Use{' '}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
              {'{{.name}}'}
            </code>{' '}
            syntax in your input for template variables.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {parameters.map((param, index) => {
            const isUsedInInput =
              param.name && inputParams.includes(param.name);
            const isRequiredByAgent =
              param.name && agentRequiredParams.includes(param.name);
            const isDuplicate =
              param.name &&
              parameters.filter(p => p.name === param.name).length > 1;

            return (
              <div
                key={index}
                className={cn(
                  'rounded-md border p-3',
                  isDuplicate && 'border-destructive/50 bg-destructive/5',
                )}>
                <div className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-muted-foreground text-[10px] tracking-wide uppercase">
                          Name
                        </Label>
                        <Input
                          value={param.name}
                          onChange={e =>
                            updateParameter(index, { name: e.target.value })
                          }
                          placeholder="parameter_name"
                          disabled={disabled}
                          className={cn(
                            'h-8 font-mono text-sm',
                            isDuplicate && 'border-destructive',
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-muted-foreground text-[10px] tracking-wide uppercase">
                          Value
                        </Label>
                        <Input
                          value={param.value}
                          onChange={e =>
                            updateParameter(index, { value: e.target.value })
                          }
                          placeholder="Enter value..."
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1 pt-4">
                    <div className="flex gap-1">
                      {isUsedInInput && (
                        <span
                          className="text-[9px] text-emerald-600 dark:text-emerald-400"
                          title="Used in input text">
                          <FileText className="h-3 w-3" />
                        </span>
                      )}
                      {isRequiredByAgent && (
                        <span
                          className="text-[9px] text-blue-600 dark:text-blue-400"
                          title="Required by agent">
                          <Bot className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParameter(index)}
                      disabled={disabled}
                      className="text-muted-foreground hover:text-destructive h-6 w-6 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(parameters.length > 0 ||
        inputParams.length > 0 ||
        agentRequiredParams.length > 0) && (
        <div className="text-muted-foreground flex items-center gap-3 text-[10px]">
          <span>{parameters.filter(p => p.name).length} defined</span>
          {inputParams.length > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {inputParams.length} in input
              </span>
            </>
          )}
          {agentRequiredParams.length > 0 && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                {agentRequiredParams.length} for agent
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
