import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Secret } from '@/lib/services/secrets';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

interface SecretEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: Secret | null;
  onSave: (name: string, password: string) => void;
  existingSecrets?: Secret[];
}

export function SecretEditor({
  open,
  onOpenChange,
  secret,
  onSave,
  existingSecrets = [],
}: SecretEditorProps) {
  const formSchema = z.object({
    name: z
      .string()
      .min(1, 'Name is required')
      .refine(val => kubernetesNameSchema.safeParse(val).success, {
        message:
          "Name must consist of lowercase alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (max 253 chars)",
      })
      .refine(
        val => {
          if (secret) return true;
          return !existingSecrets.some(s => s.name === val);
        },
        {
          message: 'A secret with this name already exists',
        },
      ),
    password: z.string().min(1, 'Password is required'),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      password: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: secret?.name || '',
        password: '',
      });
    }
  }, [open, secret, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    onSave(values.name, values.password);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{secret ? 'Edit Secret' : 'Add Secret'}</DialogTitle>
          <DialogDescription>
            {secret
              ? 'Update the password for this secret. The name cannot be changed.'
              : 'Enter the details for the new secret.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">
                        Name <span className="text-red-500">*</span>
                      </FormLabel>
                      <div className="col-span-3 space-y-1">
                        <FormControl>
                          <Input
                            placeholder="e.g. api-key-production"
                            disabled={!!secret || form.formState.isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <FormLabel className="text-right">
                        Password <span className="text-red-500">*</span>
                      </FormLabel>
                      <div className="col-span-3">
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter the secret password"
                            disabled={form.formState.isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </div>
                    </div>
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
                {form.formState.isSubmitting
                  ? 'Saving...'
                  : secret
                    ? 'Update Secret'
                    : 'Add Secret'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
