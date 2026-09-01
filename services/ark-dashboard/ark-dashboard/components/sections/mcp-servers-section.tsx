'use client';

import { PlugConnect } from '@/components/icons';
import { McpServersTable } from '@/components/sections/mcp-servers-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { DOCS_URLS } from '@/lib/constants/docs';
import { mcpServersService } from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

export function McpServersSection() {
  const { namespace } = useNamespace();
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
      loadItems={() => mcpServersService.getAll(namespace)}
      deleteItem={id => mcpServersService.delete(namespace, id)}
      renderTable={(servers, onDelete, reload) => (
        <McpServersTable
          servers={servers}
          onDelete={onDelete}
          onAuthChanged={reload}
        />
      )}
    />
  );
}
