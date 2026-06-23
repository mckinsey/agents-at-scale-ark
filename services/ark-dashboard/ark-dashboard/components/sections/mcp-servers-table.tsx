'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { IconActionButton } from '@/components/ui/icon-action-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { MCPServer } from '@/lib/services/mcp-servers';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { OriginCell, OriginColumnHeader } from './origin-column';

interface McpServersTableProps {
  readonly servers: readonly MCPServer[];
  readonly onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: { label: 'Unknown', dotClass: 'bg-fg-tertiary' },
} as const;

const COL = {
  name: 'w-[260px]',
  transport: 'w-[160px]',
  tools: 'w-[100px]',
  status: 'w-[120px]',
  action: 'w-[72px]',
};

const rowHoverOverlayClass =
  'pointer-events-none absolute inset-0 -z-10 transition-colors group-hover:bg-stateslayer-overlay-hover';

function McpServerStatus({
  status,
}: Readonly<{ status?: MCPServer['available'] | null }>) {
  const value = status ?? 'Unknown';
  const config = STATUS_CONFIG[value];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2 rounded-full', config.dotClass)} />
      <span className="label-regular-primary text-fg-primary">
        {config.label}
      </span>
    </span>
  );
}

interface McpServerTableRowProps {
  readonly server: MCPServer;
  readonly onDelete: (id: string) => void;
}

function McpServerTableRow({
  server,
  onDelete,
}: Readonly<McpServerTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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
        <TableCell size="small">
          <McpServerStatus status={server.available} />
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center">
            <IconActionButton
              label="Delete MCP server"
              disabled={readOnlyMode}
              onClick={() => {
                if (!readOnlyMode) setDeleteConfirmOpen(true);
              }}>
              <Trash />
            </IconActionButton>
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
    </>
  );
}

export function McpServersTable({
  servers,
  onDelete,
}: Readonly<McpServersTableProps>) {
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
          />
        ))}
      </TableBody>
    </Table>
  );
}
