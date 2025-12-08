'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import type React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';

import { McpServerCard } from '@/components/cards';
import { InfoDialog } from '@/components/dialogs/info-dialog';
import { McpEditor } from '@/components/editors/mcp-editor';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import { type MCPServer, mcpServersService } from '@/lib/services';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';

interface McpServersSectionProps {
  namespace: string;
}

export const McpServersSection = forwardRef<
  { openAddEditor: () => void },
  McpServersSectionProps
>(function McpServersSection({ namespace }, ref) {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setMcpEditorOpen(true),
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await mcpServersService.getAll();
        setMcpServers(data);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
        toast.error('Failed to Load MCP Servers', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [namespace]);

  const handleDelete = async (identifier: string) => {
    try {
      await mcpServersService.delete(identifier);
      setMcpServers(
        mcpServers.filter(server => (server.name || server.id) !== identifier),
      );
      toast.success('MCP Server Deleted', {
        description: 'Successfully deleted MCP server',
      });
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
      toast.error('Failed to Delete MCP Server', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const handleInfo = (server: MCPServer) => {
    setSelectedServer(server);
    setInfoDialogOpen(true);
  };

  const handleSave = async (
    mcpServer: MCPServerCreateRequest,
    edit: boolean,
  ) => {
    try {
      if (!edit) {
        await mcpServersService.create(mcpServer);
        toast.success('Mcp Created', {
          description: `Successfully created ${mcpServer.name}`,
        });
      } else {
        await mcpServersService.update(mcpServer.name, {
          spec: mcpServer.spec,
        });
        toast.success('Mcp Updated', {
          description: `Successfully updated ${mcpServer.name}`,
        });
      }
      const data = await mcpServersService.getAll();
      setMcpServers(data);
      setMcpEditorOpen(false);
    } catch (error) {
      toast.error(
        `Failed to ${mcpServer.namespace ? 'Create' : 'Update'} MCP`,
        {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        },
      );
      setMcpEditorOpen(false);
    }
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (mcpServers.length === 0 && !loading) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.mcp.icon />
            </EmptyMedia>
            <EmptyTitle>No MCP Servers Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t added any MCP Servers yet. Get started by adding
              your first MCP Server.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setMcpEditorOpen(true)}>
              <Plus className="h-4 w-4" />
              Add MCP Server
            </Button>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm">
            <a
              href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/tools/"
              target="_blank">
              Learn More <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
        <McpEditor
          open={mcpEditorOpen}
          onOpenChange={setMcpEditorOpen}
          mcpServer={null}
          onSave={handleSave}
          namespace={namespace}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
          {mcpServers.map(server => (
            <McpServerCard
              key={server.name || server.id}
              mcpServer={server}
              onDelete={handleDelete}
              onInfo={handleInfo}
              onUpdate={handleSave}
              namespace={namespace}
            />
          ))}
        </div>
      </main>

      {selectedServer && (
        <InfoDialog
          open={infoDialogOpen}
          onOpenChange={setInfoDialogOpen}
          title={`MCP Server: ${selectedServer.name || 'Unnamed'}`}
          data={selectedServer}
        />
      )}
      <McpEditor
        open={mcpEditorOpen}
        onOpenChange={setMcpEditorOpen}
        mcpServer={null}
        onSave={handleSave}
        namespace={namespace}
      />
    </div>
  );
});
