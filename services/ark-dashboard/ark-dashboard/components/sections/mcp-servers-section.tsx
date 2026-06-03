'use client';

import { PlugConnect } from '@/components/icons';
import { McpServersTable } from '@/components/sections/mcp-servers-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { mcpServersService } from '@/lib/services';

export function McpServersSection() {
  return (
    <ResourceListSection
      icon={<PlugConnect />}
      title="MCPs"
      subtitle="Add and manage all your MCPs"
      createHref="/mcp/new"
      createLabel="Add MCP Server"
      learnMoreUrl="https://mckinsey.github.io/agents-at-scale-ark/user-guide/tools/"
      entityLabel="MCP Server"
      emptyTitle="No MCP Servers Yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t added any MCP Servers yet.</p>
          <p>Get started by adding your first MCP Server.</p>
        </>
      }
      loadItems={() => mcpServersService.getAll()}
      deleteItem={id => mcpServersService.delete(id)}
      renderTable={(servers, onDelete) => (
        <McpServersTable servers={servers} onDelete={onDelete} />
      )}
    />
  );
}
