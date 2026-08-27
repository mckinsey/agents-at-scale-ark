'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { APIError } from '@/lib/api/client';
import { useCreateConfiguration } from '@/lib/services/configurations-hooks';
import {
  createResourceErrorMessage,
  type ResourceKindLabel,
} from '@/lib/services/resource-error-message';
import { useCreateSecret } from '@/lib/services/secrets-hooks';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

export type CreateResourceKind = 'secret' | 'configuration';

const createResourceSchema = z.object({
  name: kubernetesNameSchema,
  value: z.string().min(1, 'Value is required'),
});

type CreateResourceData = z.infer<typeof createResourceSchema>;

type ResourceCopy = {
  readonly kindLabel: ResourceKindLabel;
  readonly title: string;
  readonly description: string;
  readonly namePlaceholder: string;
  readonly valuePlaceholder: string;
  readonly masked: boolean;
};

const COPY: Record<CreateResourceKind, ResourceCopy> = {
  secret: {
    kindLabel: 'Secret',
    title: 'Add New Secret',
    description: 'Enter the details for the new secret.',
    namePlaceholder: 'e.g. api-key-production',
    valuePlaceholder: 'Enter the secret token',
    masked: true,
  },
  configuration: {
    kindLabel: 'Configuration',
    title: 'Add New Configuration',
    description: 'Enter the details for the new configuration.',
    namePlaceholder: 'e.g. github-mcp-url',
    valuePlaceholder: 'e.g. https://api.githubcopilot.com/mcp/',
    masked: false,
  },
};

type CreateResourceButtonProps = {
  readonly kind: CreateResourceKind;
  readonly onCreated: (name: string) => void;
  readonly defaultValue?: string;
  readonly label?: string;
  readonly dialogTitle?: string;
};

export function CreateResourceButton({
  kind,
  onCreated,
  defaultValue = '',
  label = 'Add New',
  dialogTitle,
}: CreateResourceButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const copy = COPY[kind];

  const form = useForm<CreateResourceData>({
    mode: 'onChange',
    resolver: zodResolver(createResourceSchema),
    defaultValues: { name: '', value: defaultValue },
  });

  const handleCreated = useCallback(
    (name: string) => {
      onCreated(name);
      setIsOpen(false);
    },
    [onCreated],
  );

  const secret = useCreateSecret({
    onSuccess: data => handleCreated(data.name),
  });
  const configuration = useCreateConfiguration({
    onSuccess: data => handleCreated(data.name),
  });

  const isPending =
    kind === 'secret' ? secret.isPending : configuration.isPending;
  const mutationError = kind === 'secret' ? secret.error : configuration.error;
  const submittedName =
    kind === 'secret' ? secret.variables?.name : configuration.variables?.name;

  useEffect(() => {
    if (!(mutationError instanceof APIError) || mutationError.status !== 409) {
      return;
    }
    form.setError('name', {
      message: createResourceErrorMessage(
        mutationError,
        copy.kindLabel,
        submittedName ?? '',
      ),
    });
  }, [mutationError, copy.kindLabel, form, submittedName]);

  const handleSubmit = (values: CreateResourceData) => {
    if (kind === 'secret') {
      secret.mutate({ name: values.name, password: values.value });
      return;
    }
    configuration.mutate({
      name: values.name,
      value: values.value,
      labels: [],
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isPending) {
      return;
    }
    if (open) {
      form.reset({ name: '', value: defaultValue });
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="default">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <DialogHeader>
              <DialogTitle>{dialogTitle ?? copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={copy.namePlaceholder}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type={copy.masked ? 'password' : 'text'}
                        placeholder={copy.valuePlaceholder}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
