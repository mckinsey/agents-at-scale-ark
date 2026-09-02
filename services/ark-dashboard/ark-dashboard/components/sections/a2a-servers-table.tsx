'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Poll, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { A2AServerStatus } from '@/components/sections/a2a-server-status';
import { IconActionButton } from '@/components/ui/icon-action-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { A2AServer } from '@/lib/services/a2a-servers';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

interface A2AServersTableProps {
  readonly servers: readonly A2AServer[];
  readonly onDelete: (id: string) => void;
}

const COL = {
  name: 'w-[200px]',
  address: 'w-[200px]',
  statusMessage: 'w-[200px]',
  status: 'w-[130px]',
  action: 'w-[100px]',
};

const EMPTY = '—';

function TruncatedCell({ value }: Readonly<{ value?: string | null }>) {
  if (!value) {
    return <span className="text-fg-primary">{EMPTY}</span>;
  }

  return (
    <TruncatedTooltip label={value} contentClassName="max-w-[420px] break-all">
      <span className="text-fg-primary block w-full truncate">{value}</span>
    </TruncatedTooltip>
  );
}

interface A2AServerTableRowProps {
  readonly server: A2AServer;
  readonly onDelete: (id: string) => void;
}

function A2AServerTableRow({
  server,
  onDelete,
}: Readonly<A2AServerTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const name = server.name || 'Unnamed Server';

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small" className={COL.name}>
          <span aria-hidden className={rowHoverOverlayClass} />
          <TruncatedTooltip label={name}>
            <NamespacedLink
              href={`/a2a/${encodeURIComponent(server.name)}`}
              className="text-fg-primary block w-full truncate after:absolute after:inset-0 after:content-['']">
              {name}
            </NamespacedLink>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small">
          <TruncatedCell value={server.description} />
        </TableCell>
        <TableCell size="small" className={COL.address}>
          <TruncatedCell value={server.address} />
        </TableCell>
        <TableCell size="small" className={COL.statusMessage}>
          <TruncatedCell value={server.status_message} />
        </TableCell>
        <TableCell size="small" className={COL.status}>
          <A2AServerStatus ready={server.ready} />
        </TableCell>
        <TableCell size="small" className={cn(COL.action, 'relative z-10')}>
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="See events"
              onClick={() =>
                push(
                  `/events?kind=A2AServer&name=${encodeURIComponent(server.name)}&page=1`,
                )
              }>
              <Poll />
            </IconActionButton>
            <IconActionButton
              label="Delete A2A server"
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
        title="Delete A2A Server"
        description={`Do you want to delete "${name}" A2A server? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(server.id)}
        variant="destructive"
      />
    </>
  );
}

export function A2AServersTable({
  servers,
  onDelete,
}: Readonly<A2AServersTableProps>) {
  return (
    <Table
      aria-label="A2A servers"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.address}>
            Address
          </TableHead>
          <TableHead size="small" className={COL.statusMessage}>
            Status message
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
          <A2AServerTableRow
            key={server.id}
            server={server}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
