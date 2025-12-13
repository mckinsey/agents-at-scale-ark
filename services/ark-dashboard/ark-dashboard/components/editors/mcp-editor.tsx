'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { InfoIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod/v4';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MCPServer, Secret } from '@/lib/services';
import { mcpServersService, secretsService } from '@/lib/services';
import type {
  MCPHeader,
  MCPServerCreateRequest,
} from '@/lib/services/mcp-servers';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';
import { generateMcpProxyYaml } from '@/lib/utils/mcp-template-generator';

import { ConditionalInputRow } from '../ui/conditionalInputRow';

interface McpEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpServer: MCPServer | null;
  onSave: (mcpSever: MCPServerCreateRequest, edit: boolean) => void;
  namespace: string;
}
type HeaderData = {
  key: string;
  name: string;
  type: 'direct' | 'secret';
  value: string;
};

const baseSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().min(1, 'Description is required'),
});

const httpSseSchema = baseSchema.extend({
  transport: z.enum(['http', 'sse']),
  baseUrl: z.string().min(1, 'URL is required'),
});

const stdioSchema = baseSchema.extend({
  transport: z.enum(['stdio']),
  image: z.string().min(1, 'Container Image is required'),
  command: z.string().min(1, 'Command is required'),
  args: z.string().optional(),
});

const formSchema = z.discriminatedUnion('transport', [
  httpSseSchema,
  stdioSchema,
]);

export function McpEditor({
  open,
  onOpenChange,
  mcpServer,
  onSave,
  namespace,
}: McpEditorProps) {
  const [headers, setHeaders] = useState<HeaderData[]>([
    { key: 'row-1', name: '', type: 'direct', value: '' },
  ]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [headerErrors, setHeaderErrors] = useState<
    Record<string, { nameError?: string; valueError?: string }>
  >({});

  type FormValues = z.infer<typeof formSchema>;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      transport: 'http',
      baseUrl: '',
    } as FormValues,
  });

  const transportType = form.watch('transport');

  useEffect(() => {
    if (transportType === 'stdio' && !form.getValues('image')) {
      form.setValue('image', 'node:lts-alpine');
      form.setValue('command', 'npx');
    }
  }, [transportType, form]);

  const updateRow = (index: number, updated: Partial<HeaderData>) => {
    setHeaders(prev =>
      prev.map((row, i) => (i === index ? { ...row, ...updated } : row)),
    );
  };

  const generateUniqueKey = useCallback(() => {
    const randomValue = window.crypto.getRandomValues(new Uint32Array(1))[0];
    const generatedSuffix = randomValue % 100000;
    return `row-${Date.now()}-${generatedSuffix}`;
  }, []);

  const addRow = () => {
    setHeaders(prev => [
      ...prev,
      {
        key: generateUniqueKey(),
        name: '',
        type: 'direct',
        value: '',
      },
    ]);
  };

  const deleteRow = (key: string) => {
    const updatedHeaders = headers.filter(header => header.key !== key);
    setHeaders(updatedHeaders);
    // Clear errors for the deleted row
    const newErrors = { ...headerErrors };
    delete newErrors[key];
    setHeaderErrors(newErrors);
  };

  const getMpcServerDetails = useCallback(async () => {
    const mcpServerData = await mcpServersService.get(mcpServer?.name ?? '');
    form.setValue('baseUrl', mcpServerData?.address ?? '');
    const transport = mcpServerData?.transport ?? 'http';
    if (transport === 'http' || transport === 'sse' || transport === 'stdio') {
      form.setValue('transport', transport);
    } else {
      form.setValue('transport', 'http');
    }
    form.setValue('description', mcpServerData?.description ?? '');

    if (mcpServerData?.headers) {
      setHeaders(
        mcpServerData.headers.map(header => {
          const isSecret = 'valueFrom' in header.value;
          return {
            key: generateUniqueKey(),
            name: header.name,
            type: isSecret ? 'secret' : 'direct',
            value:
              (isSecret && header.value.valueFrom?.secretKeyRef?.name) ||
              header.value.value ||
              '',
          };
        }),
      );
    }
  }, [mcpServer?.name, form, generateUniqueKey]);

  useEffect(() => {
    if (mcpServer && open) {
      form.reset({
        name: mcpServer.name,
        description: '',
        transport: 'http',
        baseUrl: '',
      } as z.infer<typeof formSchema>);
      getMpcServerDetails();
    } else {
      form.reset({
        name: '',
        description: '',
        transport: 'http',
        baseUrl: '',
      });
      setHeaders([{ key: 'row-1', name: '', type: 'direct', value: '' }]);
    }
  }, [mcpServer, open, getMpcServerDetails, form]);

  useEffect(() => {
    if (open && namespace) {
      secretsService.getAll().then(setSecrets).catch(console.error);
    }
  }, [open, namespace]);

  const returnHeaderObj = (header: HeaderData): MCPHeader => {
    if (header.type === 'direct') {
      return {
        name: header.name,
        value: {
          value: header.value,
        },
      };
    } else {
      return {
        name: header.name,
        value: {
          valueFrom: {
            secretKeyRef: {
              name: header.value,
              key: 'token',
            },
          },
        },
      };
    }
  };

  const onSubmit = (values: FormValues) => {
    if (values.transport === 'stdio') {
      const env: Record<string, string> = {};
      headers.forEach(h => {
        if (h.name && h.value) {
          env[h.name] = h.value;
        }
      });

      const yaml = generateMcpProxyYaml({
        name: values.name,
        namespace,
        image: values.image,
        command: values.command.split(' '),
        args: (values.args || '').split(' '),
        env,
      });

      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${values.name}-mcp.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onOpenChange(false);
      return;
    }

    const errors: Record<string, { nameError?: string; valueError?: string }> =
      {};
    let hasErrors = false;

    const nonEmptyHeaders = headers.filter(
      row => row.name.trim() !== '' || row.value.trim() !== '',
    );

    nonEmptyHeaders.forEach(header => {
      const headerError: { nameError?: string; valueError?: string } = {};

      if (header.name.trim() === '') {
        headerError.nameError = 'Header name is required';
        hasErrors = true;
      }

      if (header.value.trim() === '') {
        headerError.valueError = 'Header value is required';
        hasErrors = true;
      }

      if (headerError.nameError || headerError.valueError) {
        errors[header.key] = headerError;
      }
    });

    setHeaderErrors(errors);

    if (hasErrors) {
      return;
    }

    // Clear any existing header errors if validation passes
    setHeaderErrors({});

    const modifiedHeaders: MCPHeader[] = nonEmptyHeaders.map(header => {
      return returnHeaderObj(header);
    });
    const createData: MCPServerCreateRequest = {
      name: values.name,
      namespace,
      spec: {
        description: values.description,
        transport: values.transport,
        address: {
          value: values.baseUrl.trim(),
        },
        headers: modifiedHeaders,
      },
    };
    onSave(createData, !!mcpServer);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {mcpServer ? 'Edit Mcp Server' : 'Create New MCP Server'}
          </DialogTitle>
          <DialogDescription>
            {mcpServer
              ? 'Update the mcp server information below.'
              : 'Fill in the information for the new mcp server.'}
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
                    <FormLabel>
                      Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., gpt-4-turbo"
                        disabled={!!mcpServer || form.formState.isSubmitting}
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
                    <FormLabel>
                      Description <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., This is a remote github mcp server"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(transportType === 'http' || transportType === 'sse') && (
                <FormField
                  control={form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        URL <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https:/github.com/v1"
                          disabled={form.formState.isSubmitting}
                          {...field}
                          onChange={e => field.onChange(e.target.value.trim())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {transportType === 'stdio' && (
                <>
                  <Alert className="border-blue-200 bg-blue-50">
                    <InfoIcon className="h-4 w-4 text-blue-500" />
                    <AlertTitle>Manual Deployment Required</AlertTitle>
                    <AlertDescription>
                      Stdio servers require a proxy sidecar. This option will
                      generate a Kubernetes manifest (YAML) that you must
                      manually apply to your cluster.
                    </AlertDescription>
                  </Alert>

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Container Image{' '}
                          <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., node:lts-alpine"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="command"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Command <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., npx" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="args"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Args</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., -y @auth/mcp-server"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              <FormField
                control={form.control}
                name="transport"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Transport <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!mcpServer || form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a transport" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="http">http</SelectItem>
                        <SelectItem value="sse">sse</SelectItem>
                        <SelectItem value="stdio">
                          stdio (Generate YAML)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2">
                <Label htmlFor="base-url">
                  {transportType === 'stdio'
                    ? 'Environment Variables (Optional)'
                    : 'Headers'}
                </Label>
                {headers.map((row, index) => (
                  <ConditionalInputRow
                    key={row.key}
                    data={row}
                    onChange={updated => {
                      updateRow(index, updated);
                      // Clear errors for this field when user types
                      if (headerErrors[row.key]) {
                        const newErrors = { ...headerErrors };
                        if (
                          updated.name !== undefined &&
                          headerErrors[row.key].nameError
                        ) {
                          delete newErrors[row.key].nameError;
                          if (!newErrors[row.key].valueError) {
                            delete newErrors[row.key];
                          }
                        }
                        if (
                          updated.value !== undefined &&
                          headerErrors[row.key].valueError
                        ) {
                          delete newErrors[row.key].valueError;
                          if (!newErrors[row.key].nameError) {
                            delete newErrors[row.key];
                          }
                        }
                        setHeaderErrors(newErrors);
                      }
                    }}
                    secrets={secrets}
                    deleteRow={deleteRow}
                    nameError={headerErrors[row.key]?.nameError}
                    valueError={headerErrors[row.key]?.valueError}
                  />
                ))}
                <Button
                  type="button"
                  onClick={() => addRow()}
                  variant="outline"
                  size="icon">
                  <Plus className="h-2 w-2" />
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
                {form.formState.isSubmitting
                  ? 'Saving...'
                  : mcpServer
                    ? 'Update'
                    : transportType === 'stdio'
                      ? 'Download YAML'
                      : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
