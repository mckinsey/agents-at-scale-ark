'use client';

import {
  AlertTriangle,
  Link2,
  Lock,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Type,
  Variable,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

export type ParameterSource = 'value' | 'queryParameter' | 'configMapKeyRef' | 'secretKeyRef';

export interface Parameter {
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
}

const TEMPLATE_REGEX = /\{\{\s*\.([\w]+)\s*\}\}/g;

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
}: ParameterEditorProps) {
  const promptParams = useMemo(() => extractPromptParameters(prompt), [prompt]);
  const definedParamNames = new Set(parameters.map(p => p.name).filter(Boolean));

  const undefinedParams = promptParams.filter(p => !definedParamNames.has(p));
  const unusedParams = parameters.filter(
    p => p.name && !promptParams.includes(p.name),
  );

  const addParameter = (name = '', source: ParameterSource = 'queryParameter') => {
    onChange([
      ...parameters,
      { name, source, value: '', queryParameterName: '', overrideQueryName: false },
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

  const enableOverride = (index: number) => {
    updateParameter(index, {
      overrideQueryName: true,
      queryParameterName: parameters[index].queryParameterName || '',
    });
  };

  const resetOverride = (index: number) => {
    updateParameter(index, {
      overrideQueryName: false,
      queryParameterName: '',
    });
  };

  const queryParamCount = parameters.filter(
    p => p.source === 'queryParameter',
  ).length;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Variable className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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

      {/* Undefined parameters warning */}
      {undefinedParams.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Undefined parameters in prompt:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {undefinedParams.map(param => (
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

      {/* Parameter list */}
      {parameters.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No parameters defined. Use{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              {'{{.name}}'}
            </code>{' '}
            syntax in your prompt.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {parameters.map((param, index) => {
            const isUsed = param.name && promptParams.includes(param.name);
            const isDuplicate =
              param.name &&
              parameters.filter(p => p.name === param.name).length > 1;
            const isQueryParam = param.source === 'queryParameter';
            const showOverrideField = isQueryParam && param.overrideQueryName;
            const isUnsupportedSource =
              param.source === 'configMapKeyRef' ||
              param.source === 'secretKeyRef';

            return (
              <div
                key={index}
                className={cn(
                  'rounded-md border p-3',
                  !isUsed && param.name && 'border-muted bg-muted/30',
                  isDuplicate && 'border-destructive/50 bg-destructive/5',
                  isUnsupportedSource && 'border-orange-500/30 bg-orange-500/5',
                )}>
                <div className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    {/* Row 1: Name and Source */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                      <div className="w-[140px]">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Source
                        </Label>
                        <Select
                          value={param.source}
                          onValueChange={(value: ParameterSource) =>
                            updateParameter(index, { source: value })
                          }
                          disabled={disabled || isUnsupportedSource}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="queryParameter">
                              <span className="flex items-center gap-1.5">
                                <Link2 className="h-3 w-3" />
                                Query Param
                              </span>
                            </SelectItem>
                            <SelectItem value="value">
                              <span className="flex items-center gap-1.5">
                                <Type className="h-3 w-3" />
                                Direct Value
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Row 2: Value or Query Parameter info */}
                    {isUnsupportedSource ? (
                      /* Read-only warning for unsupported sources */
                      <div className="flex items-center gap-2 rounded-md bg-orange-500/10 px-3 py-2">
                        <Lock className="h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
                            {param.source === 'configMapKeyRef'
                              ? `ConfigMap: ${param.configMapRef?.name || '?'}/${param.configMapRef?.key || '?'}`
                              : `Secret: ${param.secretRef?.name || '?'}/${param.secretRef?.key || '?'}`}
                          </p>
                          <p className="text-[10px] text-orange-600/80 dark:text-orange-400/80">
                            Edit via API or kubectl - UI editing not supported
                          </p>
                        </div>
                      </div>
                    ) : param.source === 'value' ? (
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Value
                        </Label>
                        <Input
                          value={param.value || ''}
                          onChange={e =>
                            updateParameter(index, { value: e.target.value })
                          }
                          placeholder="Static value"
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : showOverrideField ? (
                      /* Override mode: show editable query param name */
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Query Parameter Name
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => resetOverride(index)}
                            disabled={disabled}
                            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Reset
                          </Button>
                        </div>
                        <Input
                          value={param.queryParameterName || ''}
                          onChange={e =>
                            updateParameter(index, {
                              queryParameterName: e.target.value,
                            })
                          }
                          placeholder="Name in query.spec.parameters"
                          disabled={disabled}
                          className="h-8 font-mono text-sm"
                        />
                      </div>
                    ) : (
                      /* Default: show info text with override button */
                      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          Will use parameter name in query.spec.parameters
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => enableOverride(index)}
                          disabled={disabled || !param.name}
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground">
                          <Settings2 className="mr-1 h-3 w-3" />
                          Override
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  <div className="flex flex-col items-center gap-1 pt-4">
                    {!isUsed && param.name && (
                      <span
                        className="text-[9px] text-muted-foreground"
                        title="Not used in prompt">
                        unused
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParameter(index)}
                      disabled={disabled}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      {(parameters.length > 0 || promptParams.length > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{parameters.filter(p => p.name).length} defined</span>
          <span>·</span>
          <span>{promptParams.length} used in prompt</span>
          {queryParamCount > 0 && (
            <>
              <span>·</span>
              <span>{queryParamCount} from query</span>
            </>
          )}
          {unusedParams.length > 0 && (
            <>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-400">
                {unusedParams.length} unused
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
