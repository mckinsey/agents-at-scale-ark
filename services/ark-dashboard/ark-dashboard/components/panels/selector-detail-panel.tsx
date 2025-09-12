"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { AlertCircle, Plus, Target, X } from "lucide-react";

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
  error
}: SelectorDetailPanelProps) {
  const addMatchLabel = () => {
    if (!selector) {
      onSelectorChange({
        resource: "Query",
        labelSelector: {
          matchLabels: { "": "" },
          matchExpressions: []
        }
      });
    } else {
      onSelectorChange({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...selector.labelSelector?.matchLabels, "": "" }
        }
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
          matchLabels: rest
        }
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
          matchLabels: { ...rest, [newKey]: value }
        }
      });
    }
  };

  const removeSelector = () => {
    onSelectorChange(null);
  };

  const addSelector = () => {
    onSelectorChange({
      resource: "Query",
      labelSelector: {
        matchLabels: {},
        matchExpressions: []
      }
    });
  };

  if (!selector) {
    return (
      <div>
        <CardHeader className="px-0 w-full">
          <CardTitle className="text-lg flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Resource Selector
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSelector}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Selector
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-15">
          <div className="text-center py-4 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
    selector.labelSelector?.matchLabels || {}
  ).length;

  return (
    <div className="flex w-full flex-col gap-3">
      <CardHeader className="px-0 w-full">
        <CardTitle className="text-lg flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Resource Selector
            {labelCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {labelCount} label{labelCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeSelector}
          >
            <X className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-0 w-full">
        {error && (
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="space-y-2 flex gap-1 flex-col">
          <Label className="text-sm font-medium">Resource Type</Label>
          <Select
            value={selector.resource}
            onValueChange={(value) =>
              onSelectorChange({ ...selector, resource: value })
            }
          >
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

        <div className="space-y-3 flex gap-1 flex-col">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Match Labels</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMatchLabel}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Label
            </Button>
          </div>

          {labelCount === 0 ? (
            <div className="text-center py-4 text-muted-foreground border border-dashed rounded">
              <p className="text-sm">No labels configured</p>
              <p className="text-xs">Add labels to match specific resources</p>
            </div>
          ) : (
            <div className="space-y-2 flex gap-1 flex-col">
              {Object.entries(selector.labelSelector?.matchLabels || {}).map(
                ([key, value], index) => (
                  <div
                    key={`label-${index}`}
                    className="flex gap-2 items-center p-2 border rounded-lg"
                  >
                    <Input
                      placeholder="Label key"
                      value={key}
                      onChange={(e) =>
                        updateMatchLabel(key, e.target.value, value)
                      }
                      className="flex-1 h-8"
                    />
                    <span className="text-muted-foreground text-sm">=</span>
                    <Input
                      placeholder="Label value"
                      value={value}
                      onChange={(e) =>
                        updateMatchLabel(key, key, e.target.value)
                      }
                      className="flex-1 h-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMatchLabel(key)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="bg-muted/50 p-3 rounded text-xs">
          <div className="font-medium mb-1">Selector Preview:</div>
          <div className="text-muted-foreground">
            This evaluator will target{" "}
            <span className="font-medium">{selector.resource}</span> resources
            {labelCount > 0 && (
              <>
                {" "}
                matching{" "}
                {Object.entries(selector.labelSelector?.matchLabels || {}).map(
                  ([key, value], index) => (
                    <span key={index}>
                      {index > 0 && " AND "}
                      <span className="font-mono bg-background px-1 rounded">
                        {key}={value}
                      </span>
                    </span>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}
