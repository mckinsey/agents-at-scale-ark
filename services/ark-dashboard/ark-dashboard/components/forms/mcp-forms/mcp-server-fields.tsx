'use client';

import type { UseFormReturn } from 'react-hook-form';

import { ConditionalInputRow } from '@/components/ui/conditionalInputRow';
import { Plus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldError, FieldSet, FieldTitle } from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';
import { cn } from '@/lib/utils';

import type { FormValues, HeaderRows } from './utils';

const GHOST_TRIGGER =
  'rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40 focus-visible:border-b-stroke-status-focus';

interface McpServerFieldsProps {
  readonly form: UseFormReturn<FormValues>;
  readonly formId: string;
  readonly onSubmit: (values: FormValues) => void;
  readonly headerRows: HeaderRows;
  readonly nameDisabled?: boolean;
  readonly transportDisabled?: boolean;
}

export function McpServerFields({
  form,
  formId,
  onSubmit,
  headerRows,
  nameDisabled,
  transportDisabled,
}: McpServerFieldsProps) {
  const { data: secrets } = useGetAllSecrets();
  const {
    headers,
    headerErrors,
    updateRow,
    addRow,
    deleteRow,
    clearRowError,
  } = headerRows;

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2">
              <FieldTitle>Name</FieldTitle>
              <Input
                variant="inline"
                {...field}
                placeholder="e.g., gpt-4-turbo"
                disabled={nameDisabled}
                aria-invalid={!!fieldState.error}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldSet>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2">
              <FieldTitle>Description</FieldTitle>
              <Input
                variant="inline"
                {...field}
                placeholder="e.g., This is a remote github mcp server"
                aria-invalid={!!fieldState.error}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldSet>
          )}
        />
        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2">
              <FieldTitle>URL</FieldTitle>
              <Input
                variant="inline"
                {...field}
                placeholder="https:/github.com/v1"
                onChange={e => field.onChange(e.target.value.trim())}
                aria-invalid={!!fieldState.error}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldSet>
          )}
        />
        <FormField
          control={form.control}
          name="transport"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2">
              <FieldTitle>Transport</FieldTitle>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={transportDisabled}>
                <SelectTrigger className={cn(GHOST_TRIGGER, 'w-full')}>
                  <SelectValue placeholder="Select a transport" />
                </SelectTrigger>
                <SelectContent className="bg-fill-onsurface-ui-2">
                  <SelectItem value="http">
                    <SelectItemText>http</SelectItemText>
                  </SelectItem>
                  <SelectItem value="sse">
                    <SelectItemText>sse</SelectItemText>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldSet>
          )}
        />
        <FieldSet className="gap-2">
          <FieldTitle>Headers</FieldTitle>
          {headers.map((row, index) => (
            <ConditionalInputRow
              key={row.key}
              data={row}
              onChange={updated => {
                updateRow(index, updated);
                clearRowError(row.key, updated);
              }}
              secrets={secrets ?? []}
              deleteRow={deleteRow}
              nameError={headerErrors[row.key]?.nameError}
              valueError={headerErrors[row.key]?.valueError}
            />
          ))}
          <Button
            type="button"
            onClick={addRow}
            variant="outline"
            size="icon"
            aria-label="Add header">
            <Plus />
          </Button>
        </FieldSet>
      </form>
    </Form>
  );
}
