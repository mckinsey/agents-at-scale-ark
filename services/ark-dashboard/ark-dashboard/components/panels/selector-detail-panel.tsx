'use client';

import { AlertCircle, Plus, Target, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MatchExpression {
  key: string;
  operator: string;
  values: string[];
}

interface Selector {
  resource: string;
  labelSelector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: MatchExpression[];
  };
}

interface SelectorDetailPanelProps {
  selector: Selector | null;
  onSelectorChange: (selector: Selector | null) => void;
  error?: string;
}

export function SelectorDetailPanel({
  selector,
  onSelectorChange,
  error,
}: SelectorDetailPanelProps) {
  const addMatchLabel = () => {
    if (!selector) {
      onSelectorChange({
        resource: 'Query',
        labelSelector: {
          matchLabels: { '': '' },
          matchExpressions: [],
        },
      });
    } else {
      onSelectorChange({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...selector.labelSelector?.matchLabels, '': '' },
        },
      });
    }
  };

  const removeMatchLabel = (key: string) => {
    if (selector?.labelSelector?.matchLabels) {
      const { [key]: _removed, ...rest } = selector.labelSelector.matchLabels;
      onSelectorChange({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: rest,
        },
      });
    }
  };

  const updateMatchLabel = (oldKey: string, newKey: string, value: string) => {
    if (selector?.labelSelector?.matchLabels) {
      const { [oldKey]: _removed, ...rest } =
        selector.labelSelector.matchLabels;
      onSelectorChange({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...rest, [newKey]: value },
        },
      });
    }
  };

  const removeSelector = () => {
    onSelectorChange(null);
  };

  const addSelector = () => {
    onSelectorChange({
      resource: 'Query',
      labelSelector: {
        matchLabels: {},
        matchExpressions: [],
      },
    });
  };

  if (!selector) {
    return (
      <div>
        <CardHeader className="w-full px-0">
          <CardTitle className="flex w-full items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Resource Selector
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSelector}>
              <Plus className="mr-1 h-4 w-4" />
              Add Selector
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-15">
          <div className="text-muted-foreground py-4 text-center">
            <Target className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">No resource selector configured</p>
            <p className="text-xs">
              Add a selector to automatically target specific resources
            </p>
          </div>
        </CardContent>
      </div>
    );
  }

  const labelCount = Object.keys(
    selector.labelSelector?.matchLabels || {},
  ).length;

  return (
    <div className="flex w-full flex-col gap-3">
      <CardHeader className="w-full px-0">
        <CardTitle className="flex w-full items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Resource Selector
            {labelCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {labelCount} label{labelCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeSelector}>
            <X className="mr-1 h-4 w-4" />
            Remove
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="w-full space-y-6 px-0">
        {error && (
          <div className="text-destructive flex items-center gap-1 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1 space-y-2">
          <Label className="text-sm font-medium">Resource Type</Label>
          <Select
            value={selector.resource}
            onValueChange={value =>
              onSelectorChange({ ...selector, resource: value })
            }>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Query">Query</SelectItem>
              <SelectItem value="Agent">Agent</SelectItem>
              <SelectItem value="Model">Model</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Match Labels</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMatchLabel}>
              <Plus className="mr-1 h-4 w-4" />
              Add Label
            </Button>
          </div>

          {labelCount === 0 ? (
            <div className="text-muted-foreground rounded border border-dashed py-4 text-center">
              <p className="text-sm">No labels configured</p>
              <p className="text-xs">Add labels to match specific resources</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 space-y-2">
              {Object.entries(selector.labelSelector?.matchLabels || {}).map(
                ([key, value], index) => (
                  <div
                    key={`label-${index}`}
                    className="flex items-center gap-2 rounded-lg border p-2">
                    <Input
                      placeholder="Label key"
                      value={key}
                      onChange={e =>
                        updateMatchLabel(key, e.target.value, value)
                      }
                      className="h-8 flex-1"
                    />
                    <span className="text-muted-foreground text-sm">=</span>
                    <Input
                      placeholder="Label value"
                      value={value}
                      onChange={e => updateMatchLabel(key, key, e.target.value)}
                      className="h-8 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMatchLabel(key)}
                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="bg-muted/50 rounded p-3 text-xs">
          <div className="mb-1 font-medium">Selector Preview:</div>
          <div className="text-muted-foreground">
            This evaluator will target{' '}
            <span className="font-medium">{selector.resource}</span> resources
            {labelCount > 0 && (
              <>
                {' '}
                matching{' '}
                {Object.entries(selector.labelSelector?.matchLabels || {}).map(
                  ([key, value], index) => (
                    <span key={index}>
                      {index > 0 && ' AND '}
                      <span className="bg-background rounded px-1 font-mono">
                        {key}={value}
                      </span>
                    </span>
                  ),
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}
