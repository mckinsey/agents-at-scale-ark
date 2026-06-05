'use client';

import { Info, LogIn, LogOut, Pencil, RefreshCw, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { Badge } from '@/components/ui/badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServerCreateRequest } from '@/lib/services/mcp-servers';
import { type MCPServer } from '@/lib/services/mcp-servers';
import {
  useLogoutMcpAuth,
  useStartMcpAuth,
} from '@/lib/services/mcp-servers-hooks';
import { getCustomIcon } from '@/lib/utils/icon-resolver';
import { getOriginIcon } from '@/lib/utils/origin-icon';

import { McpEditor } from '../editors/mcp-editor';
import { BaseCard, type BaseCardAction } from './base-card';

const NEAR_EXPIRY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

function isNearExpiry(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry - Date.now() <= NEAR_EXPIRY_THRESHOLD_MS;
}

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

  const authorization = mcpServer.authorization;
  const authState = authorization?.state ?? null;
  const nearExpiry =
    authState === 'Authorized' && isNearExpiry(authorization?.expiresAt);

  const handleAuthenticate = (force: boolean) => {
    startAuth.mutate(
      { name: mcpServer.name, namespace, force },
      {
        onSuccess: data => {
          window.location.assign(data.authorization_url);
        },
        onError: error => {
          toast.error('Failed to start authentication', {
            description: getErrorMessage(error),
          });
        },
      },
    );
  };

  const handleSignOut = () => {
    logoutAuth.mutate(
      { name: mcpServer.name, namespace },
      {
        onSuccess: () => {
          toast.success('Signed out', {
            description: `Cleared authorization for ${mcpServer.name}`,
          });
          onAuthChanged?.();
        },
        onError: error => {
          toast.error('Failed to sign out', {
            description: getErrorMessage(error),
          });
        },
      },
    );
  };

  // Get custom icon or default Server icon
  const annotations = mcpServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  if (authState === 'Required') {
    actions.push({
      icon: LogIn,
      label: 'Authenticate MCP server',
      onClick: () => handleAuthenticate(false),
    });
  }

  if (authState === 'Authorized') {
    actions.push({
      icon: RefreshCw,
      label: 'Re-authenticate MCP server',
      onClick: () => handleAuthenticate(true),
    });
    actions.push({
      icon: LogOut,
      label: 'Sign out MCP server',
      onClick: () => setSignOutConfirmOpen(true),
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

  const originIcon = getOriginIcon(
    mcpServer.annotations?.[ARK_ANNOTATIONS.ORIGIN],
  );

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
            <div className="flex w-fit flex-wrap items-center gap-x-1.5 gap-y-1">
              <AvailabilityStatusBadge
                status={mcpServer.available}
                eventsLink={`/events?kind=MCPServer&name=${mcpServer.name}&page=1`}
              />
              {originIcon}
              {authState === 'Required' && (
                <Badge variant="secondary">Auth required</Badge>
              )}
              {authState === 'DiscoveryFailed' && (
                <Badge variant="destructive">Auth discovery failed</Badge>
              )}
              {authState === 'Authorized' && (
                <Badge
                  variant={nearExpiry ? 'destructive' : 'outline'}
                  title={authorization?.authorizedBy ?? undefined}>
                  {nearExpiry ? 'Auth expiring' : 'Authorized'}
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
            {authState === 'Authorized' && authorization?.expiresAt && (
              <div
                className={
                  nearExpiry ? 'text-amber-600 dark:text-amber-400' : undefined
                }>
                <span className="font-medium">Authorization expires:</span>{' '}
                {new Date(authorization.expiresAt).toLocaleString()}
                {authorization.authorizedBy
                  ? ` (by ${authorization.authorizedBy})`
                  : ''}
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
      <ConfirmationDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title="Sign out MCP Server"
        description={`Sign out of "${mcpServer.name || 'this MCP server'}"? This clears the stored authorization.`}
        confirmText="Sign out"
        cancelText="Cancel"
        onConfirm={handleSignOut}
        variant="destructive"
      />
    </>
  );
}
