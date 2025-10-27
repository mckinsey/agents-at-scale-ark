'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AdditionalField {
  key: string;
  value: unknown;
  label?: string;
}

interface InfoDialogProps<T extends object> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: T & {
    labels?: unknown;
    annotations?: unknown;
    namespace?: unknown;
  };
  additionalFields?: AdditionalField[];
}

export function InfoDialog<T extends object>({
  open,
  onOpenChange,
  title,
  data,
  additionalFields = [],
}: InfoDialogProps<T>) {
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  // Recursively parse JSON strings
  const recursiveJsonParse = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(obj);
        // Recursively parse the result
        return recursiveJsonParse(parsed);
      } catch {
        // Not valid JSON, return as is
        return obj;
      }
    } else if (Array.isArray(obj)) {
      // Recursively parse array elements
      return obj.map(item => recursiveJsonParse(item));
    } else if (obj !== null && typeof obj === 'object') {
      // Recursively parse object values
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = recursiveJsonParse(value);
      }
      return result;
    }
    // Return primitives as is
    return obj;
  };

  const formatValue = (value: unknown, key: string): React.ReactNode => {
    if (value === null || value === undefined) {
      return '-';
    }

    // Special handling for annotations field - parse JSON string recursively
    if (key === 'annotations') {
      const parsed = recursiveJsonParse(value);
      return (
        <pre className="bg-muted max-h-[400px] min-h-[100px] overflow-auto rounded p-4 text-xs">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    }

    if (typeof value === 'object') {
      return (
        <pre className="bg-muted max-h-64 overflow-auto rounded p-2 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    return String(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Detailed information</DialogDescription>
        </DialogHeader>
        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto">
          <>
            {additionalFields.map(field => (
              <div
                key={field.key}
                className="grid grid-cols-3 gap-4 border-b py-2">
                <div className="text-sm font-medium">
                  {field.label || field.key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="text-muted-foreground col-span-2 text-sm">
                  {formatValue(field.value, field.key)}
                </div>
              </div>
            ))}

            {Object.entries(data)
              .filter(
                ([key]) =>
                  key !== 'namespace' &&
                  key !== 'labels' &&
                  key !== 'annotations',
              )
              .map(([key, value]) => (
                <div key={key} className="grid grid-cols-3 gap-4 border-b py-2">
                  <div className="text-sm font-medium capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="text-muted-foreground col-span-2 text-sm">
                    {formatValue(value, key)}
                  </div>
                </div>
              ))}

            {!!(data.labels || data.annotations) && (
              <div className="rounded-lg border">
                <button
                  onClick={() => setMetadataExpanded(!metadataExpanded)}
                  className="hover:bg-muted/50 flex w-full items-center justify-between p-3 transition-colors">
                  <span className="text-sm font-medium">
                    Metadata (Labels & Annotations)
                  </span>
                  {metadataExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {metadataExpanded && (
                  <div className="space-y-4 p-3 pt-0">
                    {!!data.labels && (
                      <div>
                        <div className="mb-2 text-sm font-medium">Labels</div>
                        <div className="text-muted-foreground text-sm">
                          {formatValue(data.labels, 'labels')}
                        </div>
                      </div>
                    )}

                    {!!data.annotations && (
                      <div>
                        <div className="mb-2 text-sm font-medium">
                          Annotations
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {formatValue(data.annotations, 'annotations')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        </div>
      </DialogContent>
    </Dialog>
  );
}
