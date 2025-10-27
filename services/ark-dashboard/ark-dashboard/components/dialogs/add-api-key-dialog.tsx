'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  expires_at: z.string().optional(),
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

    // Reset form
    form.reset();

    // Close dialog and show success
    onOpenChange(false);
    onSuccess(response);
  };

  const handleCancel = () => {
    form.reset();
    createAPIKeyMutation.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for service-to-service authentication.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter a descriptive name"
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
                <FormItem>
                  <FormLabel>Expires At (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      disabled={createAPIKeyMutation.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty for no expiration
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {createAPIKeyMutation.error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-600">
                <p className="text-sm">
                  {createAPIKeyMutation.error instanceof Error
                    ? createAPIKeyMutation.error.message
                    : 'Failed to create API key'}
                </p>
              </div>
            )}

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={createAPIKeyMutation.isPending}
                className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAPIKeyMutation.isPending}
                className="w-full sm:w-auto">
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
