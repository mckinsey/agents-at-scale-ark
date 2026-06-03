'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { mcpServersService } from '@/lib/services';
import type { MCPServerDetail } from '@/lib/services/mcp-servers';

import { McpServerFields } from './mcp-server-fields';
import { McpServerFormShell } from './mcp-server-form-shell';
import type { FormValues } from './utils';
import { buildSpec, formSchema, mapDetailHeaders, useHeaderRows } from './utils';

const formId = 'update-mcp-server-form';

type UpdateMcpServerFormProps = {
  server: MCPServerDetail;
};

export function UpdateMcpServerForm({ server }: UpdateMcpServerFormProps) {
  const { push } = useNamespacedNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headerRows = useHeaderRows(mapDetailHeaders(server.headers));

  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: server.name,
      description: server.description ?? '',
      baseUrl: server.address ?? '',
      transport: server.transport === 'sse' ? 'sse' : 'http',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const nonEmptyHeaders = headerRows.validate();
    if (!nonEmptyHeaders) {
      return;
    }

    setIsSubmitting(true);
    try {
      await mcpServersService.update(server.name, {
        spec: buildSpec(values, nonEmptyHeaders),
      });
      toast.success('Mcp Updated', {
        description: `Successfully updated ${server.name}`,
      });
      push('/mcp');
    } catch (error) {
      toast.error('Failed to Update MCP', {
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
      breadcrumbCurrent={server.name}
      title={`Update MCP Server: ${server.name}`}
      subtitle="Update the information for the mcp server."
      isSubmitting={isSubmitting}
      submitLabel="Update MCP Server"
      submittingLabel="Updating MCP Server...">
      <McpServerFields
        form={form}
        formId={formId}
        onSubmit={onSubmit}
        headerRows={headerRows}
        nameDisabled
        transportDisabled
      />
    </McpServerFormShell>
  );
}
