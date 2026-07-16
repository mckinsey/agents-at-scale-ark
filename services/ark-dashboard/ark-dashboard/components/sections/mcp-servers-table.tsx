'use client';

import { type ReactNode, useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import {
  Autorenew,
  Logout,
  MoreVert,
  Trash,
  Warning,
} from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconShell } from '@/components/ui/icon-shell';
import { toast } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMcpAuthCompletion } from '@/lib/hooks/use-mcp-auth-completion';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServer } from '@/lib/services/mcp-servers';
import {
  useLogoutMcpAuth,
  useStartMcpAuth,
} from '@/lib/services/mcp-servers-hooks';
import { cn } from '@/lib/utils';
import { formatExpiry, isNearExpiry } from '@/lib/utils/mcp-auth';
import { useNamespace } from '@/providers/NamespaceProvider';

import { OriginCell, OriginColumnHeader } from './origin-column';

interface McpServersTableProps {
  readonly servers: readonly MCPServer[];
  readonly onDelete: (id: string) => void;
  readonly onAuthChanged?: () => void;
}

// Fallback status for servers without an MCP authorization block (non-OAuth).
const AVAILABILITY_CONFIG = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: { label: 'Unknown', dotClass: 'bg-fg-tertiary' },
} as const;

// Maps backend MCP authorization.state to the Status column labels + dot colors.
const AUTH_STATUS_CONFIG: Record<
  string,
  { label: string; dotClass: string }
> = {
  Authorized: { label: 'Authorized', dotClass: 'bg-status-success' },
  Required: { label: 'Unauthenticated', dotClass: 'bg-status-error' },
  DiscoveryFailed: { label: 'Error', dotClass: 'bg-status-error' },
};

const COL = {
  name: 'w-[260px]',
  transport: 'w-[160px]',
  tools: 'w-[100px]',
  expires: 'w-[200px]',
  status: 'w-[120px]',
  action: 'w-[72px]',
};

const rowHoverOverlayClass =
  'pointer-events-none absolute inset-0 -z-10 transition-colors group-hover:bg-stateslayer-overlay-hover';

function McpServerStatus({ server }: Readonly<{ server: MCPServer }>) {
  const authState = server.authorization?.state;
  const authConfig = authState ? AUTH_STATUS_CONFIG[authState] : undefined;
  const config =
    authConfig ?? AVAILABILITY_CONFIG[server.available ?? 'Unknown'];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2 rounded-full', config.dotClass)} />
      <span className="label-regular-primary text-fg-primary">
        {config.label}
      </span>
    </span>
  );
}

function McpServerExpires({ server }: Readonly<{ server: MCPServer }>) {
  const authorization = server.authorization;
  if (authorization?.state !== 'Authorized' || !authorization.expiresAt) {
    return <span className="text-fg-primary">—</span>;
  }
  const nearExpiry = isNearExpiry(authorization.expiresAt);
  return (
    <span className="text-fg-primary inline-flex items-center gap-1.5">
      {nearExpiry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Warning className="text-status-warning size-4 shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Expiring soon</TooltipContent>
        </Tooltip>
      )}
      <span className="truncate">{formatExpiry(authorization.expiresAt)}</span>
    </span>
  );
}

// Disabled Re-authenticate / Sign out for servers where MCP auth is not
// applicable (no authorization block, or discovery failed).
function DisabledAuthMenuItem({
  icon,
  label,
}: Readonly<{ icon: ReactNode; label: string }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">
          <DropdownMenuItem disabled>
            {icon}
            {label}
          </DropdownMenuItem>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Authentication isn&apos;t required for this MCP
      </TooltipContent>
    </Tooltip>
  );
}

interface McpServerTableRowProps {
  readonly server: MCPServer;
  readonly onDelete: (id: string) => void;
  readonly onAuthChanged?: () => void;
}

function McpServerTableRow({
  server,
  onDelete,
  onAuthChanged,
}: Readonly<McpServerTableRowProps>) {
  const { namespace, readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

  const startAuth = useStartMcpAuth();
  const logoutAuth = useLogoutMcpAuth();

  const authState = server.authorization?.state;

  const handleAuthenticate = (force: boolean) => {
    startAuth.mutate(
      { name: server.name, options: { namespace, force } },
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
      { name: server.name, options: { namespace } },
      {
        onSuccess: () => {
          toast.success('Signed Out', {
            description: `Revoked authorization for ${server.name}`,
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

  const renderAuthMenuItems = () => {
    if (authState === 'Required') {
      return (
        <DropdownMenuItem
          disabled={startAuth.isPending}
          onSelect={() => handleAuthenticate(false)}>
          <Autorenew className="size-4" />
          Authenticate
        </DropdownMenuItem>
      );
    }
    if (authState === 'Authorized') {
      return (
        <>
          <DropdownMenuItem
            disabled={startAuth.isPending}
            onSelect={() => handleAuthenticate(true)}>
            <Autorenew className="size-4" />
            Re-authenticate
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={logoutAuth.isPending}
            onSelect={() => setSignOutConfirmOpen(true)}>
            <Logout className="size-4" />
            Sign out
          </DropdownMenuItem>
        </>
      );
    }
    return (
      <>
        <DisabledAuthMenuItem
          icon={<Autorenew className="size-4" />}
          label="Re-authenticate"
        />
        <DisabledAuthMenuItem
          icon={<Logout className="size-4" />}
          label="Sign out"
        />
      </>
    );
  };

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <NamespacedLink
            href={`/mcp/${encodeURIComponent(server.id)}/update`}
            title={server.name}
            className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
            {server.name}
          </NamespacedLink>
        </TableCell>
        <OriginCell origin={server.annotations?.[ARK_ANNOTATIONS.ORIGIN]} />
        <TableCell size="small">
          <span
            className="text-fg-primary block truncate"
            title={server.address ?? ''}>
            {server.address ?? '—'}
          </span>
        </TableCell>
        <TableCell size="small" className={COL.transport}>
          <span
            className="text-fg-primary block truncate"
            title={server.transport ?? ''}>
            {server.transport ?? '—'}
          </span>
        </TableCell>
        <TableCell size="small" className={COL.tools}>
          <span className="text-fg-primary block truncate">
            {server.tool_count ?? '—'}
          </span>
        </TableCell>
        <TableCell size="small" className={COL.expires}>
          <McpServerExpires server={server} />
        </TableCell>
        <TableCell size="small">
          <McpServerStatus server={server} />
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="MCP server actions"
                  disabled={readOnlyMode}>
                  <IconShell size="sm" variant="secondary">
                    <MoreVert />
                  </IconShell>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteConfirmOpen(true)}>
                  <Trash className="size-4" />
                  Delete
                </DropdownMenuItem>
                {renderAuthMenuItems()}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete MCP Server"
        description={`Do you want to delete "${server.name}" server? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(server.id)}
        variant="destructive"
      />
      <ConfirmationDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title="Sign Out"
        description={`Do you want to revoke authorization for "${server.name}"? You will need to authenticate again to use it.`}
        confirmText="Sign out"
        cancelText="Cancel"
        onConfirm={handleSignOut}
        variant="destructive"
      />
    </>
  );
}

export function McpServersTable({
  servers,
  onDelete,
  onAuthChanged,
}: Readonly<McpServersTableProps>) {
  useMcpAuthCompletion({ servers: [...servers], onCompleted: onAuthChanged });

  return (
    <Table
      aria-label="MCP Servers"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <OriginColumnHeader tooltip="Where the MCP server was first created" />
          <TableHead size="small">Address</TableHead>
          <TableHead size="small" className={COL.transport}>
            Transport
          </TableHead>
          <TableHead size="small" className={COL.tools}>
            Tools
          </TableHead>
          <TableHead size="small" className={COL.expires}>
            Expires
          </TableHead>
          <TableHead size="small" className={COL.status}>
            Status
          </TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {servers.map(server => (
          <McpServerTableRow
            key={server.id}
            server={server}
            onDelete={onDelete}
            onAuthChanged={onAuthChanged}
          />
        ))}
      </TableBody>
    </Table>
  );
}
