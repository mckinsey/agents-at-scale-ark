'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
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
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  onSave: (config: A2AServerConfiguration) => void;
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

export function A2AEditor({ open, onOpenChange, namespace, onSave }: Props) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      baseUrl: '',
      pollingInterval: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset();
    }
  }, [open, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const config: A2AServerConfiguration = {
      name: values.name,
      namespace,
      spec: {
        description: values.description || undefined,
        address: { value: values.baseUrl },
        pollingInterval: values.pollingInterval
          ? Number(values.pollingInterval)
          : undefined,
      },
    };

    onSave(config);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
