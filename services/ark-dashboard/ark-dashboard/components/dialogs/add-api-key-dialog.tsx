'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DateTimeField } from '@/components/common/date-time-field';
import { ResourceErrorState } from '@/components/sections/resource-list-states';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  type APIKeyCreateRequest,
  type APIKeyCreateResponse,
} from '@/lib/services';
import { useCreateAPIKey } from '@/lib/services/api-keys-hooks';

/** Value shape DateTimeField emits once the date parses. */
const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  expires_at: z
    .string()
    .optional()
    .refine(value => !value || DATETIME_LOCAL_PATTERN.test(value), {
      message: 'Enter a complete date as dd/mm/yyyy',
    }),
});

interface AddAPIKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (response: APIKeyCreateResponse) => void;
}

export function AddAPIKeyDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddAPIKeyDialogProps) {
  const createAPIKeyMutation = useCreateAPIKey();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      expires_at: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const request: APIKeyCreateRequest = {
      name: values.name.trim(),
      expires_at: values.expires_at
        ? new Date(values.expires_at).toISOString()
        : null,
    };

    const response = await createAPIKeyMutation.mutateAsync(request);

    form.reset();
    onOpenChange(false);
    onSuccess(response);
  };

  const handleCancel = () => {
    form.reset();
    createAPIKeyMutation.reset();
    onOpenChange(false);
  };

  // Escape and the X close via onOpenChange, which would otherwise skip the
  // reset and leave a stale error banner behind on reopen.
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    // Cancel is disabled while creating; Escape, the X and outside-click must
    // not discard the in-flight mutation either.
    if (createAPIKeyMutation.isPending) {
      return;
    }
    handleCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[586px]">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="flex flex-col gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="label-regular-primary text-fg-secondary">
                      Name *
                    </FormLabel>
                    <FormControl>
                      <Input
                        variant="inline"
                        placeholder="enter a descriptive name"
                        disabled={createAPIKeyMutation.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expires_at"
                render={({ field }) => (
                  <FormItem className="gap-2">
                    <FormLabel className="label-regular-primary text-fg-secondary">
                      Expires at
                    </FormLabel>
                    <FormControl>
                      <DateTimeField
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={createAPIKeyMutation.isPending}
                        dateLabel="Expiry date"
                        timeLabel="Expiry time"
                      />
                    </FormControl>
                    <FormDescription className="paragraph-regular-primary text-fg-tertiary">
                      Leave empty for no expiration
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {createAPIKeyMutation.error && (
                <ResourceErrorState
                  title="Couldn't create API key"
                  description={
                    createAPIKeyMutation.error instanceof Error
                      ? createAPIKeyMutation.error.message
                      : 'Failed to create API key'
                  }
                />
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={createAPIKeyMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAPIKeyMutation.isPending}>
                {createAPIKeyMutation.isPending
                  ? 'Creating...'
                  : 'Create API Key'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
