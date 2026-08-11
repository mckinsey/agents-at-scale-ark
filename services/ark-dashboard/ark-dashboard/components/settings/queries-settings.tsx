'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useArkConfig,
  useClearArkConfig,
  useUpdateArkConfig,
} from '@/lib/services/arkconfig-hooks';

const TTL_PATTERN = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;

function validate(value: string): string | null {
  if (value.trim() === '') return null;
  if (!TTL_PATTERN.test(value.trim())) {
    return 'Use a Go duration like 30m, 12h, or 720h.';
  }
  return null;
}

export function QueriesSettings() {
  const { data, isLoading, isError, error } = useArkConfig();
  const updateMutation = useUpdateArkConfig();
  const clearMutation = useClearArkConfig();

  const [input, setInput] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setInput(data?.queryTTL ?? '');
  }, [data?.queryTTL]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-600">
        <p className="font-medium">Error loading settings</p>
        <p className="mt-1 text-sm">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const handleSave = () => {
    const trimmed = input.trim();
    const validation = validate(trimmed);
    if (validation) {
      setLocalError(validation);
      return;
    }
    setLocalError(null);
    updateMutation.mutate({ queryTTL: trimmed === '' ? null : trimmed });
  };

  const handleReset = () => {
    setLocalError(null);
    setInput('');
    clearMutation.mutate();
  };

  const isSaving = updateMutation.isPending || clearMutation.isPending;
  const hasExisting = data?.exists ?? false;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-sidebar-foreground text-sm font-semibold">
          Default Query TTL
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Applied to queries that do not set <code>spec.ttl</code>. A per-query
          value always overrides this setting. When unset, the built-in 720h
          default is used.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="queryTTL">Query TTL</Label>
        <Input
          id="queryTTL"
          placeholder="e.g. 720h"
          value={input}
          onChange={e => setInput(e.target.value)}
          aria-invalid={!!localError}
        />
        {localError && (
          <p className="text-sm text-red-600" role="alert">
            {localError}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Accepts Go duration strings (e.g. <code>30m</code>, <code>12h</code>,{' '}
          <code>720h</code>). Leave empty to inherit the built-in default.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isSaving || !hasExisting}>
          {clearMutation.isPending ? 'Clearing...' : 'Reset to default'}
        </Button>
      </div>
    </div>
  );
}
