'use client';

import { Info, Pencil, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { type MCPServer } from '@/lib/services/mcp-servers';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import { McpEditor } from '../editors/mcp-editor';
import { BaseCard, type BaseCardAction } from './base-card';

interface McpServerCardProps {
  mcpServer: MCPServer;
  onDelete?: (id: string) => void;
  onInfo?: (mcpServer: MCPServer) => void;
  namespace: string;
  onUpdate?: (mcpServerConfig: MCPServerCreateRequest, edit: boolean) => void;
}

export function McpServerCard({
  mcpServer,
  onDelete,
  onInfo,
  onUpdate,
  namespace,
}: McpServerCardProps) {
  const actions: BaseCardAction[] = [];
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get custom icon or default Server icon
  const annotations = mcpServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: 'Edit Mcp server details',
      onClick: () => setMcpEditorOpen(true),
    });
  }

  if (onInfo) {
    actions.push({
      icon: Info,
      label: 'View MCP server details',
      onClick: () => onInfo(mcpServer),
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete MCP server',
      onClick: () => setDeleteConfirmOpen(true),
    });
  }

  // Get the address from either status.lastResolvedAddress or spec.address.value
  const address = mcpServer.address || 'Address not available';
  const transport = mcpServer.transport || 'unknown';

  return (
    <>
      <BaseCard
        title={mcpServer.name || 'Unnamed Server'}
        icon={<IconComponent className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}
        footer={
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            <div className="w-fit">
              <AvailabilityStatusBadge
                status={mcpServer.available}
                eventsLink={`/events?kind=MCPServer&name=${mcpServer.name}&page=1`}
              />
            </div>
            <div>
              <span className="font-medium">Address:</span> {address}
            </div>
            <div>
              <span className="font-medium">Transport:</span> {transport}
            </div>
            {mcpServer.tool_count !== undefined &&
              mcpServer.tool_count !== null && (
                <div>
                  <span className="font-medium">Tools:</span>{' '}
                  {mcpServer.tool_count}
                </div>
              )}
            {mcpServer.status_message && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {mcpServer.status_message}
              </div>
            )}
          </div>
        }
      />
      <McpEditor
        open={mcpEditorOpen}
        onOpenChange={setMcpEditorOpen}
        mcpServer={mcpServer}
        onSave={onUpdate || (() => {})}
        namespace={namespace}
      />
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete MCP Server"
          description={`Do you want to delete "${mcpServer.name || 'this MCP server'}" server? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(mcpServer.name || mcpServer.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
