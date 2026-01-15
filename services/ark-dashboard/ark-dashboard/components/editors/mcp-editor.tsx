'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  DirectHeader,
  MCPHeader,
  MCPServerCreateRequest,
  SecretHeader,
} from '@/lib/services/mcp-servers';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

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

const formSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().min(1, 'Description is required'),
  baseUrl: z.string().min(1, 'URL is required'),
  transport: z.enum(['http', 'sse'], {
    message: 'Transport is required',
  }),
});

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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      baseUrl: '',
      transport: 'http',
    },
  });

  const updateRow = (index: number, updated: Partial<HeaderData>) => {
    setHeaders(prev =>
      prev.map((row, i) => (i === index ? { ...row, ...updated } : row)),
    );
  };

  const generateUniqueKey = () => {
    const randomValue = window.crypto.getRandomValues(new Uint32Array(1))[0];
    const generatedSuffix = randomValue % 100000;
    return `row-${Date.now()}-${generatedSuffix}`;
  };

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
  };

  const getMpcServerDetails = useCallback(async () => {
    const mcpServerData = await mcpServersService.get(mcpServer?.name ?? '');
    form.setValue('baseUrl', mcpServerData?.address ?? '');
    form.setValue(
      'transport',
      (mcpServerData?.transport as 'http' | 'sse') ?? 'http',
    );
    form.setValue('description', mcpServerData?.description ?? '');

    if (mcpServerData?.headers) {
      const transformedHeaders: HeaderData[] = mcpServerData?.headers?.map(
        (header: MCPHeader) => {
          const isSecret = 'valueFrom' in header.value;

          return {
            key: generateUniqueKey(),
            name: header.name,
            type: isSecret ? 'secret' : 'direct',
            value: isSecret
              ? (header as SecretHeader).value.valueFrom.secretKeyRef.name
              : (header as DirectHeader).value.value || '',
          };
        },
      );
      setHeaders(transformedHeaders);
    }
  }, [mcpServer?.name, form]);

  useEffect(() => {
    if (mcpServer && open) {
      form.reset({
        name: mcpServer.name,
        description: '',
        baseUrl: '',
        transport: 'http',
      });
      getMpcServerDetails();
    } else {
      form.reset();
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

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Validate headers
    const allFieldsFilled = headers.every(
      row => row.name.trim() !== '' && row.value.trim() !== '',
    );

    if (!allFieldsFilled) {
      form.setError('name', {
        message: 'All header fields must be filled in',
      });
      return;
    }

    const modifiedHeaders: MCPHeader[] = headers.map(header => {
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
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2">
                <Label htmlFor="base-url">Headers</Label>
                {headers.map((row, index) => (
                  <ConditionalInputRow
                    key={row.key}
                    data={row}
                    onChange={updated => updateRow(index, updated)}
                    secrets={secrets}
                    deleteRow={deleteRow}
                  />
                ))}
                <Button onClick={() => addRow()} variant="outline" size="icon">
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
                    : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
