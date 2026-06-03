'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { mcpServersService } from '@/lib/services';
import type { MCPServerDetail } from '@/lib/services/mcp-servers';
import { useNamespace } from '@/providers/NamespaceProvider';

import { McpServerFields } from './mcp-server-fields';
import type { FormValues } from './utils';
import {
  buildHeader,
  formSchema,
  mapDetailHeaders,
  useHeaderRows,
  validateHeaders,
} from './utils';

const formId = 'update-mcp-server-form';

type UpdateMcpServerFormProps = {
  server: MCPServerDetail;
};

export function UpdateMcpServerForm({ server }: UpdateMcpServerFormProps) {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
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
    const { errors, hasErrors, nonEmptyHeaders } = validateHeaders(
      headerRows.headers,
    );
    headerRows.setHeaderErrors(errors);
    if (hasErrors) {
      return;
    }

    setIsSubmitting(true);
    try {
      await mcpServersService.update(server.name, {
        spec: {
          description: values.description,
          transport: values.transport,
          address: { value: values.baseUrl.trim() },
          headers: nonEmptyHeaders.map(buildHeader),
        },
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
    <div className="absolute inset-0 flex flex-col gap-5 overflow-hidden px-12 pt-10">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <ChevronLeft className="size-4 text-white/30" />
            <NamespacedLink
              href="/mcp"
              className="text-white/30 transition-colors hover:text-white/60">
              MCPs
            </NamespacedLink>
            <span aria-hidden="true" className="text-white/60">
              /
            </span>
            <span aria-current="page" className="text-white/60">
              {server.name}
            </span>
          </nav>
          <div className="flex items-center gap-2">
            <NamespacedLink href="/mcp">
              <Button variant="outline">Cancel</Button>
            </NamespacedLink>
            <Button
              type="submit"
              form={formId}
              disabled={isSubmitting || readOnlyMode}>
              {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
              {isSubmitting ? 'Updating MCP Server...' : 'Update MCP Server'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-fg-primary text-xl leading-7">
            Update MCP Server: {server.name}
          </h1>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Update the information for the mcp server.
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-auto pb-2 pl-px">
        <div className="flex w-[576px] flex-col">
          <McpServerFields
            form={form}
            formId={formId}
            onSubmit={onSubmit}
            headerRows={headerRows}
            nameDisabled
            transportDisabled
          />
        </div>
      </div>
    </div>
  );
}
