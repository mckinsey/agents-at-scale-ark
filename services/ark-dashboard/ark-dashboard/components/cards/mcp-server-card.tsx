'use client';

import { Info, KeyRound, LogOut, Pencil, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { McpAuthDialog } from '@/components/dialogs/mcp-auth-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { Badge } from '@/components/ui/badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { mcpServersService, type MCPServer } from '@/lib/services/mcp-servers';
import { getCustomIcon } from '@/lib/utils/icon-resolver';
import {
  formatAuthorizedAt,
  getAuthorizationInfo,
} from '@/lib/utils/mcp-auth';

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
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const authInfo = getAuthorizationInfo(mcpServer);

  // Get custom icon or default Server icon
  const annotations = mcpServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  // Handle logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await mcpServersService.authLogout(mcpServer.name);
      // Trigger a refresh by calling onUpdate with current server (if available)
      if (onUpdate) {
        window.location.reload(); // Simple refresh for now
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      setIsLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  // Auth actions - show login if not authorized, logout if authorized
  if (authInfo.state === 'Authorized') {
    actions.push({
      icon: LogOut,
      label: 'Sign out',
      onClick: () => setLogoutConfirmOpen(true),
    });
  } else if (authInfo.state === 'Required') {
    actions.push({
      icon: KeyRound,
      label: 'Authorize',
      onClick: () => setAuthDialogOpen(true),
    });
  }

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
            <div className="flex items-center gap-2">
              <div className="w-fit">
                <AvailabilityStatusBadge
                  status={mcpServer.available}
                  eventsLink={`/events?kind=MCPServer&name=${mcpServer.name}&page=1`}
                />
              </div>
              {authInfo.state === 'Authorized' && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  <KeyRound className="mr-1 h-3 w-3" />
                  Authorized
                </Badge>
              )}
              {authInfo.state === 'Required' && (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  <KeyRound className="mr-1 h-3 w-3" />
                  Auth Required
                </Badge>
              )}
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
            {authInfo.state === 'Authorized' && authInfo.authorizedBy && (
              <div className="text-xs">
                <span className="font-medium">Authorized by:</span>{' '}
                {authInfo.authorizedBy}
                {authInfo.authorizedAt && (
                  <span className="text-muted-foreground">
                    {' '}
                    at {formatAuthorizedAt(authInfo.authorizedAt)}
                  </span>
                )}
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
      <McpAuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        mcpServerName={mcpServer.name}
        onSuccess={() => {
          setAuthDialogOpen(false);
          window.location.reload(); // Simple refresh for now
        }}
      />
      <ConfirmationDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title="Sign out of MCP Server"
        description={`Do you want to sign out of "${mcpServer.name}"? You will need to re-authorize to use this server.`}
        confirmText={isLoggingOut ? 'Signing out...' : 'Sign out'}
        cancelText="Cancel"
        onConfirm={handleLogout}
        variant="default"
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
