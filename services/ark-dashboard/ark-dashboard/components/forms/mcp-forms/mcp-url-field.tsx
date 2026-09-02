'use client';

import type { UseFormReturn } from 'react-hook-form';

import { CreateResourceButton } from '@/components/forms/shared/create-resource-dialog';
import { FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetAllConfigurations } from '@/lib/services/configurations-hooks';
import { cn } from '@/lib/utils';

import type { FormValues, UrlFieldState } from './utils';

type McpUrlFieldProps = {
  readonly form: UseFormReturn<FormValues>;
  readonly state: UrlFieldState;
};

export function McpUrlField({ form, state }: McpUrlFieldProps) {
  const { data: configurations } = useGetAllConfigurations();

  if (state.kind === 'service') {
    const { serviceRef } = state;
    const location = [
      serviceRef.name,
      serviceRef.port ? `:${serviceRef.port}` : '',
      serviceRef.path ?? '',
    ].join('');
    return (
      <FieldSet className="gap-2">
        <FieldTitle>URL (service in the cluster)</FieldTitle>
        <Input variant="inline" value={location} readOnly disabled />
        <p className="text-sm">
          This server points at the Service {serviceRef.name}
          {serviceRef.namespace ? ` in namespace ${serviceRef.namespace}` : ''}.
          Change the Service to change the address.
        </p>
      </FieldSet>
    );
  }

  const currentUrl = state.kind === 'literal' ? state.url : '';

  return (
    <FormField
      control={form.control}
      name="configurationName"
      render={({ field, fieldState }) => (
        <FieldSet className="gap-2">
          <FieldTitle>URL</FieldTitle>
          {state.kind === 'literal' && (
            <p className="text-sm">
              This URL is currently stored in the MCP server itself:{' '}
              {state.url}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger
                className={cn(GHOST_TRIGGER, 'flex-1')}
                aria-invalid={!!fieldState.error}>
                <SelectValue placeholder="Select a configuration" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {configurations?.map(configuration => (
                  <SelectItem
                    key={configuration.name}
                    value={configuration.name}>
                    <SelectItemText>{configuration.name}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CreateResourceButton
              kind="configuration"
              label={
                state.kind === 'literal' ? 'Move to configuration' : 'Add New'
              }
              dialogTitle={
                state.kind === 'literal'
                  ? 'Move URL to a configuration'
                  : undefined
              }
              defaultValue={currentUrl}
              onCreated={name =>
                form.setValue('configurationName', name, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            />
          </div>
          {configurations?.length === 0 && (
            <p className="text-sm">No configurations in this namespace.</p>
          )}
          <FieldError>{fieldState.error?.message}</FieldError>
        </FieldSet>
      )}
    />
  );
}
