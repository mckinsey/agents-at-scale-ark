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
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { useNamespace } from '@/providers/NamespaceProvider';

import { McpServerFields } from './mcp-server-fields';
import type { FormValues } from './utils';
import { buildHeader, formSchema, useHeaderRows, validateHeaders } from './utils';

const formId = 'create-mcp-server-form';

export function CreateMcpServerForm() {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode, namespace } = useNamespace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const headerRows = useHeaderRows();

  const form = useForm<FormValues>({
    mode: 'onChange',
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      baseUrl: '',
      transport: 'http',
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

    const createData: MCPServerCreateRequest = {
      name: values.name,
      namespace,
      spec: {
        description: values.description,
        transport: values.transport,
        address: { value: values.baseUrl.trim() },
        headers: nonEmptyHeaders.map(buildHeader),
      },
    };

    setIsSubmitting(true);
    try {
      await mcpServersService.create(createData);
      toast.success('Mcp Created', {
        description: `Successfully created ${createData.name}`,
      });
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
              New MCP server
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
              {isSubmitting ? 'Creating MCP Server...' : 'Create MCP Server'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-fg-primary text-xl leading-7">
            Add New MCP Server
          </h1>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            Fill in the information for the new mcp server.
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
          />
        </div>
      </div>
    </div>
  );
}
