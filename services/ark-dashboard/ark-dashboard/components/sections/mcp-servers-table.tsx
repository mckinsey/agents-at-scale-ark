'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import type { MCPServer } from '@/lib/services/mcp-servers';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

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
  name: 'w-[260px] shrink-0',
  address: 'flex-1 min-w-0',
  transport: 'w-[160px] shrink-0',
  tools: 'w-[100px] shrink-0',
  status: 'w-[120px] shrink-0',
  action: 'w-[72px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

function McpServerStatus({ status }: { status?: MCPServer['available'] | null }) {
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

function McpServerTableRow({ server, onDelete }: McpServerTableRowProps) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover relative flex cursor-pointer items-center gap-x-4 transition-colors">
        <div role="cell" className={cn(rowCellClass, COL.name)}>
          <NamespacedLink
            href={`/mcp/${encodeURIComponent(server.id)}/update`}
            title={server.name}
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px] after:absolute after:inset-0 after:content-['']">
            {server.name}
          </NamespacedLink>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.address)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={server.address ?? ''}>
            {server.address ?? '—'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.transport)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={server.transport ?? ''}>
            {server.transport ?? '—'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.tools)}>
          <span className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]">
            {server.tool_count ?? '—'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.status)}>
          <McpServerStatus status={server.available} />
        </div>
        <div
          role="cell"
          className={cn(
            rowCellClass,
            COL.action,
            'relative z-10 justify-center',
          )}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete MCP server"
            disabled={readOnlyMode}
            onClick={() => {
              if (!readOnlyMode) setDeleteConfirmOpen(true);
            }}>
            <IconShell size="sm" variant="secondary">
              <Trash />
            </IconShell>
          </Button>
        </div>
      </div>
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

export function McpServersTable({ servers, onDelete }: McpServersTableProps) {
  return (
    <div role="table" aria-label="MCP Servers" className="flex w-full flex-col">
      <div role="row" className="flex items-center gap-x-4">
        <div role="columnheader" className={cn(headerCellClass, COL.name)}>
          Name
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.address)}>
          Address
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.transport)}>
          Transport
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.tools)}>
          Tools
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.status)}>
          Status
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {servers.map(server => (
          <McpServerTableRow
            key={server.id}
            server={server}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
