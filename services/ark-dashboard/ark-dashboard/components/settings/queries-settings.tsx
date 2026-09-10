'use client';

import { useAtom } from 'jotai';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { storedQueryTimeoutSettingAtom } from '@/atoms/experimental-features';
import { ErrorIcon, Info } from '@/components/icons';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  useArkConfig,
  useClearArkConfig,
  useUpdateArkConfig,
} from '@/lib/services/arkconfig-hooks';

const TTL_PATTERN = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;
const DEFAULT_QUERY_TIMEOUT_MINUTES = 5;
const DEFAULT_QUERY_TIMEOUT = `${DEFAULT_QUERY_TIMEOUT_MINUTES}m`;
const TIMEOUT_ERROR_MESSAGE =
  'Use a whole number of minutes greater than zero.';

function validate(value: string): string | null {
  if (value.trim() === '') return null;
  if (!TTL_PATTERN.test(value.trim())) {
    return 'Use a Go duration like 30m, 12h, or 720h.';
  }
  return null;
}

function validateTimeout(value: string): string | null {
  if (value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim()) || Number(value) <= 0) {
    return TIMEOUT_ERROR_MESSAGE;
  }
  return null;
}

export function QueriesSettings() {
  const { data, isLoading, isError, error } = useArkConfig();
  const updateMutation = useUpdateArkConfig();
  const clearMutation = useClearArkConfig();

  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const timeoutFieldId = `${fieldId}-timeout`;
  const timeoutDescriptionId = `${timeoutFieldId}-description`;

  const [storedTimeout, setStoredTimeout] = useAtom(
    storedQueryTimeoutSettingAtom,
  );

  const [input, setInput] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [timeoutInput, setTimeoutInput] = useState<string>('');
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [timeoutBadInput, setTimeoutBadInput] = useState(false);

  useEffect(() => {
    setInput(data?.queryTTL ?? '');
  }, [data?.queryTTL]);

  useEffect(() => {
    setTimeoutInput(`${Number.parseInt(storedTimeout, 10) || ''}`);
  }, [storedTimeout]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-fg-secondary paragraph-regular-primary">
          Loading settings...
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert className="max-w-full" aria-live="assertive">
        <AlertIcon className="text-status-error">
          <IconShell size="default">
            <ErrorIcon />
          </IconShell>
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Error loading settings</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : String(error)}
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  const hasExisting = data?.exists ?? false;

  const handleSave = () => {
    const trimmed = input.trim();
    const trimmedTimeout = timeoutInput.trim();
    const validation = validate(trimmed);
    const timeoutValidation = timeoutBadInput
      ? TIMEOUT_ERROR_MESSAGE
      : validateTimeout(trimmedTimeout);

    setLocalError(validation);
    setTimeoutError(timeoutValidation);
    if (validation || timeoutValidation) {
      return;
    }

    const nextTimeout =
      trimmedTimeout === '' ? DEFAULT_QUERY_TIMEOUT : `${trimmedTimeout}m`;
    const ttlChanged = trimmed !== (data?.queryTTL ?? '');
    const timeoutChanged = nextTimeout !== storedTimeout;

    if (!ttlChanged && !timeoutChanged) {
      toast.info('No changes to save');
      return;
    }

    setStoredTimeout(nextTimeout);

    if (!ttlChanged) {
      toast.success('Settings saved');
      return;
    }

    updateMutation.mutate({ queryTTL: trimmed === '' ? null : trimmed });
  };

  const handleReset = () => {
    setLocalError(null);
    setTimeoutError(null);
    setTimeoutBadInput(false);
    setInput('');
    setTimeoutInput(`${DEFAULT_QUERY_TIMEOUT_MINUTES}`);
    setStoredTimeout(DEFAULT_QUERY_TIMEOUT);

    if (!hasExisting) {
      toast.success('Defaults cleared');
      return;
    }

    clearMutation.mutate(undefined);
  };

  const isSaving = updateMutation.isPending || clearMutation.isPending;
  const hasResettableState =
    hasExisting ||
    storedTimeout !== DEFAULT_QUERY_TIMEOUT ||
    input.trim() !== '' ||
    timeoutInput.trim() !== `${DEFAULT_QUERY_TIMEOUT_MINUTES}`;

  return (
    <div className="flex max-w-[600px] flex-col gap-6">
      <FieldSet className="gap-2">
        <FieldLabel htmlFor={timeoutFieldId}>Query timeout</FieldLabel>
        <Input
          id={timeoutFieldId}
          type="number"
          min={1}
          step={1}
          variant="inline"
          placeholder="e.g. 5"
          value={timeoutInput}
          onChange={e => {
            setTimeoutInput(e.target.value);
            setTimeoutBadInput(Boolean(e.target.validity?.badInput));
          }}
          aria-invalid={!!timeoutError}
          aria-describedby={timeoutDescriptionId}
        />
        <FieldDescription id={timeoutDescriptionId}>
          Default timeout for query execution, in minutes. Stored in this
          browser only and applied to queries created from this dashboard.
        </FieldDescription>
        <FieldError>{timeoutError}</FieldError>
      </FieldSet>

      <FieldSet className="gap-2">
        <FieldLabel htmlFor={fieldId}>Query TTL</FieldLabel>
        <Input
          id={fieldId}
          variant="inline"
          placeholder="e.g. 720h"
          value={input}
          onChange={e => setInput(e.target.value)}
          aria-invalid={!!localError}
          aria-describedby={descriptionId}
        />
        <FieldDescription id={descriptionId}>
          Accepts Go duration strings (e.g. <code>30m</code>, <code>12h</code>,{' '}
          <code>720h</code>). Leave empty to inherit the built-in default.
        </FieldDescription>
        <FieldError>{localError}</FieldError>
      </FieldSet>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isSaving || !hasResettableState}>
          {clearMutation.isPending ? 'Clearing...' : 'Reset to default'}
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <Alert className="max-w-full" role="status" aria-live="polite">
        <AlertIcon className="text-status-information">
          <IconShell size="default">
            <Info />
          </IconShell>
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Default Query TTL</AlertTitle>
          <AlertDescription>
            Applied to queries that do not set <code>spec.ttl</code>. A
            per-query value always overrides this setting. When unset, the
            built-in 720h default is used.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}
