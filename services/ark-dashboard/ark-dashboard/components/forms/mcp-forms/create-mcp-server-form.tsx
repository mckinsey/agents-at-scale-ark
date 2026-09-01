'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/ui/sonner';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { mcpServersService } from '@/lib/services';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { useNamespace } from '@/providers/NamespaceProvider';

import { McpServerFields } from './mcp-server-fields';
import { McpServerFormShell } from './mcp-server-form-shell';
import type { AddressMode, FormValues } from './utils';
import { buildSpec, createFormSchema, useHeaderRows } from './utils';

const formId = 'create-mcp-server-form';

const addressMode: AddressMode = { kind: 'configuration' };

export function CreateMcpServerForm() {
  const { push } = useNamespacedNavigation();
  const { namespace } = useNamespace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headerRows = useHeaderRows();

  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(createFormSchema(addressMode)),
    defaultValues: {
      name: '',
      description: '',
      configurationName: '',
      transport: 'http',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const nonEmptyHeaders = headerRows.validate();
    if (!nonEmptyHeaders) {
      return;
    }

    const createData: MCPServerCreateRequest = {
      name: values.name,
      namespace,
      spec: buildSpec(values, nonEmptyHeaders, addressMode),
    };

    setIsSubmitting(true);
    try {
      await mcpServersService.create(namespace, createData);
      toast.success('MCP server created successfully');
      push('/mcp');
    } catch (error) {
      toast.error('Failed to Create MCP', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
      setIsSubmitting(false);
    }
  };

  return (
    <McpServerFormShell
      formId={formId}
      breadcrumbCurrent="New MCP server"
      title="Add New MCP Server"
      subtitle="Fill in the information for the new mcp server."
      isSubmitting={isSubmitting}
      submitLabel="Create MCP Server"
      submittingLabel="Creating MCP Server...">
      <McpServerFields
        form={form}
        formId={formId}
        onSubmit={onSubmit}
        headerRows={headerRows}
        urlState={{ kind: 'create' }}
      />
    </McpServerFormShell>
  );
}
