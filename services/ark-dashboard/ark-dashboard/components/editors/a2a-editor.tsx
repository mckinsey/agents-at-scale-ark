'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
  EMPTY_HEADER_ROW,
  type HeaderData,
  useHeaderRows,
} from '@/components/forms/shared/header-rows';
import { Plus } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConditionalInputRow } from '@/components/ui/conditionalInputRow';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type {
  A2AServerConfiguration,
  Header,
} from '@/lib/services/a2a-servers';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  onSave: (config: A2AServerConfiguration) => void | Promise<void>;
};

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  baseUrl: z.string().min(1, 'URL is required').url('URL must be a valid URL'),
  pollingInterval: z
    .string()
    .optional()
    .refine(
      val => !val || !isNaN(Number(val)),
      'Polling interval must be a valid number',
    ),
});

const LABEL_CLASS = 'label-regular-primary text-fg-secondary';

const SECRET_HEADER_KEY = 'token';

function buildHeader(header: HeaderData): Header {
  if (header.type === 'direct') {
    return { name: header.name, value: { value: header.value } };
  }

  return {
    name: header.name,
    value: {
      valueFrom: {
        secretKeyRef: { name: header.value, key: SECRET_HEADER_KEY },
      },
    },
  };
}

export function A2AEditor({ open, onOpenChange, namespace, onSave }: Props) {
  const headerRows = useHeaderRows();
  const { data: secrets } = useGetAllSecrets();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      baseUrl: '',
      pollingInterval: '',
    },
  });

  const { setHeaders, setHeaderErrors } = headerRows;

  useEffect(() => {
    if (open) {
      form.reset();
      setHeaders([EMPTY_HEADER_ROW]);
      setHeaderErrors({});
    }
  }, [open, form, setHeaders, setHeaderErrors]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const nonEmptyHeaders = headerRows.validate();
    if (!nonEmptyHeaders) {
      return;
    }

    const config: A2AServerConfiguration = {
      name: values.name,
      namespace,
      spec: {
        description: values.description || undefined,
        address: { value: values.baseUrl },
        pollingInterval: values.pollingInterval
          ? Number(values.pollingInterval)
          : undefined,
        headers: nonEmptyHeaders.length
          ? nonEmptyHeaders.map(buildHeader)
          : undefined,
      },
    };

    await onSave(config);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && form.formState.isSubmitting) {
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[586px]">
        <DialogHeader>
          <DialogTitle>Create new A2A server</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="flex flex-col gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>Name *</FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        placeholder="e.g., deep-research"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>Description</FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        placeholder="what this server does"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>URL *</FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        placeholder="https://agentspace-a2a.default.svc.cluster.local:2973/a2a/agent/..."
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pollingInterval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>
                      Polling Interval (seconds)
                    </FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        type="number"
                        placeholder="e.g., 60"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>Headers</span>
                {headerRows.headers.map((row, index) => (
                  <ConditionalInputRow
                    key={row.key}
                    data={row}
                    onChange={updated => {
                      headerRows.updateRow(index, updated);
                      headerRows.clearRowError(row.key, updated);
                    }}
                    secrets={secrets ?? []}
                    deleteRow={headerRows.deleteRow}
                    nameError={headerRows.headerErrors[row.key]?.nameError}
                    valueError={headerRows.headerErrors[row.key]?.valueError}
                    namePlaceholder="e.g., Authorization"
                    valuePlaceholder="e.g., Bearer token"
                  />
                ))}
                <Button
                  type="button"
                  onClick={headerRows.addRow}
                  variant="outline"
                  size="icon"
                  disabled={form.formState.isSubmitting}
                  aria-label="Add header">
                  <Plus />
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
