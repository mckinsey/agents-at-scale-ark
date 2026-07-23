'use client';

import { Info, Pencil, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { Button } from '@/components/ui/button';
import { McpAuthBadge } from '@/components/ui/mcp-auth-badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { type MCPServer } from '@/lib/services/mcp-servers';
import {
  useLogoutMcpAuth,
  useStartMcpAuth,
} from '@/lib/services/mcp-servers-hooks';
import { getCustomIcon } from '@/lib/utils/icon-resolver';
import { formatExpiry, isNearExpiry } from '@/lib/utils/mcp-auth';
import { getOriginIcon } from '@/lib/utils/origin-icon';

import { McpEditor } from '../editors/mcp-editor';
import { BaseCard, type BaseCardAction } from './base-card';

interface McpServerCardProps {
  mcpServer: MCPServer;
  onDelete?: (id: string) => void;
  onInfo?: (mcpServer: MCPServer) => void;
  namespace: string;
  onUpdate?: (mcpServerConfig: MCPServerCreateRequest, edit: boolean) => void;
  onAuthChanged?: () => void;
}

export function McpServerCard({
  mcpServer,
  onDelete,
  onInfo,
  onUpdate,
  namespace,
  onAuthChanged,
}: McpServerCardProps) {
  const actions: BaseCardAction[] = [];
  const [mcpEditorOpen, setMcpEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const startAuth = useStartMcpAuth();
  const logoutAuth = useLogoutMcpAuth();

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

  const originIcon = getOriginIcon(
    mcpServer.annotations?.[ARK_ANNOTATIONS.ORIGIN],
  );

  // Get the address from either status.lastResolvedAddress or spec.address.value
  const address = mcpServer.address || 'Address not available';
  const transport = mcpServer.transport || 'unknown';

  const authorization = mcpServer.authorization;
  const nearExpiry =
    authorization?.state === 'Authorized' &&
    isNearExpiry(authorization.expiresAt);

  const handleAuthenticate = (force: boolean) => {
    startAuth.mutate(
      { name: mcpServer.name, options: { namespace, force } },
      {
        onSuccess: response => {
          window.location.href = response.authorization_url;
        },
        onError: error => {
          toast.error('Failed to Start Authentication', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
        },
      },
    );
  };

  const handleSignOut = () => {
    logoutAuth.mutate(
      { name: mcpServer.name, options: { namespace } },
      {
        onSuccess: () => {
          toast.success('Signed Out', {
            description: `Revoked authorization for ${mcpServer.name}`,
          });
          onAuthChanged?.();
        },
        onError: error => {
          toast.error('Failed to Sign Out', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
        },
      },
    );
  };

  return (
    <>
      <BaseCard
        title={mcpServer.name || 'Unnamed Server'}
        icon={<IconComponent className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}
        footer={
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            <div className="flex w-fit items-center gap-x-1.5">
              <AvailabilityStatusBadge
                status={mcpServer.available}
                eventsLink={`/events?kind=MCPServer&name=${mcpServer.name}&page=1`}
              />
              {originIcon}
              <McpAuthBadge authorization={authorization} />
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
            {authorization?.state === 'Authorized' &&
              authorization.expiresAt && (
                <div
                  className={
                    nearExpiry
                      ? 'text-amber-600 dark:text-amber-400'
                      : undefined
                  }>
                  <span className="font-medium">Expires:</span>{' '}
                  {formatExpiry(authorization.expiresAt)}
                  {nearExpiry && ' (expiring soon)'}
                </div>
              )}
            {mcpServer.status_message && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {mcpServer.status_message}
              </div>
            )}
            {authorization && authorization.state !== 'DiscoveryFailed' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {authorization.state === 'Required' && (
                  <Button
                    size="sm"
                    onClick={() => handleAuthenticate(false)}
                    disabled={startAuth.isPending}>
                    Authenticate
                  </Button>
                )}
                {authorization.state === 'Authorized' && (
                  <>
                    <Button
                      size="sm"
                      variant={nearExpiry ? 'default' : 'outline'}
                      onClick={() => handleAuthenticate(true)}
                      disabled={startAuth.isPending}>
                      Re-authenticate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSignOutConfirmOpen(true)}
                      disabled={logoutAuth.isPending}>
                      Sign out
                    </Button>
                  </>
                )}
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
      <ConfirmationDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title="Sign Out"
        description={`Revoke the authorization for "${mcpServer.name || 'this MCP server'}"? You will need to authenticate again to use it.`}
        confirmText="Sign Out"
        cancelText="Cancel"
        onConfirm={handleSignOut}
        variant="destructive"
      />
    </>
  );
}
