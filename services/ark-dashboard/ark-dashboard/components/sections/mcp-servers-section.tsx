'use client';

import type React from 'react';
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { toast } from '@/components/ui/use-toast';
import { mcpServersService, type MCPServer } from '@/lib/services';
import { McpServerCard } from '@/components/cards';
import { useDelayedLoading } from '@/lib/hooks';
import { InfoDialog } from '@/components/dialogs/info-dialog';
import { McpEditor } from '../editors/mcp-editor';
import { MCPServerConfiguration } from '@/lib/services/mcp-servers';

interface McpServersSectionProps {
  namespace: string;
}

export const McpServersSection = forwardRef<{ openAddEditor: () => void }, McpServersSectionProps>(function McpServersSection({ namespace }, ref) {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setMcpEditorOpen(true)
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await mcpServersService.getAll();
        setMcpServers(data);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
        toast({
          variant: 'destructive',
          title: 'Failed to Load MCP Servers',
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred'
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
        mcpServers.filter((server) => (server.name || server.id) !== identifier)
      );
      toast({
        variant: 'success',
        title: 'MCP Server Deleted',
        description: 'Successfully deleted MCP server'
      });
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Delete MCP Server',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
      });
    }
  };

  const handleInfo = (server: MCPServer) => {
    setSelectedServer(server);
    setInfoDialogOpen(true);
  };


  const handleSave = async (mcpServer: MCPServerConfiguration, edit: boolean) => {
    try {
      if(!edit){
      await mcpServersService.create(mcpServer);
      toast({
        variant: 'success',
        title: 'Mcp Created',
        description: `Successfully created ${mcpServer.name}`
      });
    }
    else {
      await mcpServersService.update(mcpServer.name, {spec: mcpServer.spec});
      toast({
        variant: 'success',
        title: 'Mcp Updated',
        description: `Successfully updated ${mcpServer.name}`
      });
    }
      const data = await mcpServersService.getAll();
      setMcpServers(data);
      setMcpEditorOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: `Failed to ${mcpServer.namespace ? 'Create': 'Update'} MCP`,
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred'
      });
      setMcpEditorOpen(false);
    }
  };

  if (showLoading) {
    return (
      <div className='flex h-full items-center justify-center'>
        <div className='text-center py-8'>Loading...</div>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      <main className='flex-1 overflow-auto p-6'>
        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6'>
          {mcpServers.map((server) => (
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