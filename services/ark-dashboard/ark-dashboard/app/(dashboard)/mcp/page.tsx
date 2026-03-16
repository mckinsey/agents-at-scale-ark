'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { McpServersSection } from '@/components/sections/mcp-servers-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetAllMcpServers } from '@/lib/services/mcp-servers-hooks';

export default function McpPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const mcpSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const { data: mcpServers } = useGetAllMcpServers();

  const pageTitle = mcpServers
    ? `MCP Servers (${mcpServers.length})`
    : 'MCP Servers';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="MCP Servers"
        actions={
          <Button onClick={() => mcpSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add MCP Server
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <McpServersSection ref={mcpSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
