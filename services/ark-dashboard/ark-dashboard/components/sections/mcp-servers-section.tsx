'use client';

import { PlugConnect } from '@/components/icons';
import { McpServersTable } from '@/components/sections/mcp-servers-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { DOCS_URLS } from '@/lib/constants/docs';
import {
  useDeleteMcpServer,
  useGetAllMcpServers,
} from '@/lib/services/mcp-servers-hooks';

export function McpServersSection() {
  const {
    data: servers = [],
    isPending,
    error,
    refetch,
  } = useGetAllMcpServers();
  const deleteMcpServer = useDeleteMcpServer();

  return (
    <ResourceListSection
      icon={<PlugConnect />}
      title="MCP servers"
      showCount
      subtitle="Add and manage all your MCPs"
      createHref="/mcp/new"
      createLabel="Add MCP"
      learnMoreUrl={DOCS_URLS.tools}
      entityLabel="MCP Server"
      entityPluralLabel="MCP servers"
      emptyTitle="No MCP Servers Yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t added any MCP Servers yet.</p>
          <p>Get started by adding your first MCP Server.</p>
        </>
      }
      items={servers}
      loading={isPending}
      error={error}
      onDelete={id => deleteMcpServer.mutate(id)}
      onReload={() => refetch()}
      renderTable={(items, onDelete, reload) => (
        <McpServersTable
          servers={items}
          onDelete={onDelete}
          onAuthChanged={reload}
        />
      )}
    />
  );
}
