'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from '@/components/ui/sonner';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { mcpServersService } from '@/lib/services';
import type { MCPServerDetail } from '@/lib/services/mcp-servers';
import {
  GET_ALL_MCP_SERVERS_QUERY_KEY,
  GET_MCP_SERVER_QUERY_KEY,
} from '@/lib/services/mcp-servers-hooks';

import { McpServerFields } from './mcp-server-fields';
import { McpServerFormShell } from './mcp-server-form-shell';
import type { AddressMode, FormValues } from './utils';
import {
  buildSpec,
  buildUpdateAddressMode,
  createFormSchema,
  mapDetailAddress,
  mapDetailHeaders,
  useHeaderRows,
} from './utils';
import { useNamespace } from '@/providers/NamespaceProvider';

const formId = 'update-mcp-server-form';

type UpdateMcpServerFormProps = {
  server: MCPServerDetail;
};

export function UpdateMcpServerForm({
  server,
}: Readonly<UpdateMcpServerFormProps>) {
  const { namespace } = useNamespace();
  const { push } = useNamespacedNavigation();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headerRows = useHeaderRows(mapDetailHeaders(server.headers));

  const urlState = mapDetailAddress(server.address_source, server.address);
  const addressMode: AddressMode = buildUpdateAddressMode(urlState);

  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(createFormSchema(addressMode)),
    defaultValues: {
      name: server.name,
      description: server.description ?? '',
      configurationName:
        urlState.kind === 'configuration' ? urlState.configurationName : '',
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
      await mcpServersService.update(namespace, server.name, {
        spec: buildSpec(values, nonEmptyHeaders, addressMode),
      });
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
      });
      queryClient.invalidateQueries({
        queryKey: [GET_MCP_SERVER_QUERY_KEY, server.name],
      });
      toast.success('MCP server updated successfully');
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
        urlState={urlState}
        nameDisabled
        transportDisabled
      />
    </McpServerFormShell>
  );
}
