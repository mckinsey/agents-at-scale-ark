'use client';

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Trash,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Parameter {
  name: string;
  value: string;
}

interface ParameterDetailPanelProps {
  parameters: Parameter[];
  onParametersChange: (parameters: Parameter[]) => void;
  error?: string;
}

export function ParameterDetailPanel({
  parameters,
  onParametersChange,
  error,
}: ParameterDetailPanelProps) {
  const [expandedParams, setExpandedParams] = useState<Set<number>>(new Set());

  const addParameter = () => {
    const newParams = [...parameters, { name: '', value: '' }];
    onParametersChange(newParams);
    // Auto-expand the new parameter
    setExpandedParams(prev => new Set(prev).add(newParams.length - 1));
  };

  const removeParameter = (index: number) => {
    const newParams = parameters.filter((_, i) => i !== index);
    onParametersChange(newParams);
    // Remove from expanded set and adjust indices
    const newExpanded = new Set<number>();
    expandedParams.forEach(expandedIndex => {
      if (expandedIndex < index) {
        newExpanded.add(expandedIndex);
      } else if (expandedIndex > index) {
        newExpanded.add(expandedIndex - 1);
      }
    });
    setExpandedParams(newExpanded);
  };

  const updateParameter = (
    index: number,
    field: 'name' | 'value',
    value: string,
  ) => {
    const newParams = [...parameters];
    newParams[index][field] = value;
    onParametersChange(newParams);
  };

  const toggleParameterExpanded = (index: number) => {
    const newExpanded = new Set(expandedParams);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedParams(newExpanded);
  };

  const isLongValue = (value: string) =>
    value.length > 100 || value.includes('\n');

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <h3 className="font-medium">Parameters</h3>
            {parameters.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {parameters.length}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addParameter}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {error && (
          <div className="text-destructive flex items-center gap-1 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col items-center space-y-3 overflow-y-auto p-4 ${
          parameters.length === 0 ? 'justify-center' : ''
        }`}>
        {parameters.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <Settings className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">No parameters configured</p>
            <p className="text-xs">Click the + button to add parameters</p>
          </div>
        ) : (
          parameters.map((param, index) => {
            const isExpanded = expandedParams.has(index);
            const hasLongValue = isLongValue(param.value);

            return (
              <Card key={index} className="relative min-h-[auto] w-full py-5">
                <Collapsible
                  open={isExpanded}
                  onOpenChange={() => toggleParameterExpanded(index)}>
                  <CardHeader>
                    <div className="flex w-full justify-between">
                      <CollapsibleTrigger
                        asChild
                        className="flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:bg-color-none p-0">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="text-sm font-medium">
                              {param.name || `Parameter ${index + 1}`}
                            </span>
                            {hasLongValue && (
                              <Badge variant="outline" className="text-xs">
                                Long text
                              </Badge>
                            )}
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParameter(index)}
                        className="hover:text-destructive p-0 text-red-500">
                        <Trash />
                      </Button>
                    </div>
                    {!isExpanded && param.value && (
                      <div
                        className="text-muted-foreground mt-1 overflow-hidden text-xs break-words"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: '1.4',
                          maxHeight: '2.8em',
                        }}>
                        Value:{' '}
                        {param.value.length > 120
                          ? `${param.value.substring(0, 120)}...`
                          : param.value}
                      </div>
                    )}
                  </CardHeader>

                  <CollapsibleContent className="pt-5">
                    <CardContent className="space-y-3 pt-0">
                      <div className="flex flex-col gap-1 space-y-1">
                        <Label className="text-xs font-medium">Name</Label>
                        <Input
                          value={param.name}
                          onChange={e =>
                            updateParameter(index, 'name', e.target.value)
                          }
                          placeholder="parameter_name"
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="flex flex-col gap-1 space-y-1">
                        <Label className="text-xs font-medium">Value</Label>
                        {hasLongValue || param.value.length > 50 ? (
                          <Textarea
                            value={param.value}
                            onChange={e =>
                              updateParameter(index, 'value', e.target.value)
                            }
                            placeholder="Parameter value..."
                            className="min-h-[100px] resize-none text-sm whitespace-pre-wrap"
                            rows={6}
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                            }}
                          />
                        ) : (
                          <Input
                            value={param.value}
                            onChange={e =>
                              updateParameter(index, 'value', e.target.value)
                            }
                            placeholder="Parameter value"
                            className="h-8 text-sm"
                          />
                        )}
                      </div>

                      {param.name === 'evaluator_role' && param.value && (
                        <div className="bg-muted/50 rounded p-3 text-xs">
                          <div className="mb-2 font-medium">
                            Evaluator Role Preview:
                          </div>
                          <div className="text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                            {param.value.substring(0, 300)}
                            {param.value.length > 300 && '...'}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })
        )}
      </div>

      {parameters.length > 0 && (
        <div className="bg-muted/30 border-t p-4">
          <div className="text-muted-foreground text-xs">
            {parameters.length} parameter{parameters.length !== 1 ? 's' : ''}{' '}
            configured
          </div>
        </div>
      )}
    </div>
  );
}
