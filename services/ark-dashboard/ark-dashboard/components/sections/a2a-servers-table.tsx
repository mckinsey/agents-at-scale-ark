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
  name: 'w-[130px]',
  address: 'w-[140px]',
  statusMessage: 'w-[140px]',
  protocol: 'w-[80px]',
  version: 'w-[72px]',
  streaming: 'w-[84px]',
  skills: 'w-[60px]',
  status: 'w-[116px]',
  action: 'w-[88px]',
};

const EMPTY = '—';

function formatStreaming(value?: boolean | null): string {
  if (value === null || value === undefined) {
    return EMPTY;
  }
  return value ? 'Yes' : 'No';
}

interface HeaderLabelProps {
  readonly label: string;
}

function HeaderLabel({ label }: Readonly<HeaderLabelProps>) {
  return (
    <TruncatedTooltip label={label}>
      <span className="block truncate">{label}</span>
    </TruncatedTooltip>
  );
}

interface TruncatedCellProps {
  readonly value?: string | null;
  readonly href: string;
}

function TruncatedCell({ value, href }: Readonly<TruncatedCellProps>) {
  const link = (
    <NamespacedLink
      href={href}
      tabIndex={-1}
      className="text-fg-primary block w-full truncate">
      {value || EMPTY}
    </NamespacedLink>
  );

  if (!value) {
    return link;
  }

  return (
    <TruncatedTooltip label={value} contentClassName="max-w-[420px] break-all">
      {link}
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
  const detailHref = `/a2a/${encodeURIComponent(server.name)}`;

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small" className={COL.name}>
          <span aria-hidden className={rowHoverOverlayClass} />
          <TruncatedTooltip label={name}>
            <NamespacedLink
              href={detailHref}
              className="text-fg-primary block w-full truncate after:absolute after:inset-0 after:content-['']">
              {name}
            </NamespacedLink>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <TruncatedCell value={server.description} href={detailHref} />
        </TableCell>
        <TableCell size="small" className={cn(COL.address, 'relative z-10')}>
          <TruncatedCell value={server.address} href={detailHref} />
        </TableCell>
        <TableCell
          size="small"
          className={cn(COL.statusMessage, 'relative z-10')}>
          <TruncatedCell value={server.status_message} href={detailHref} />
        </TableCell>
        <TableCell size="small" className={cn(COL.protocol, 'relative z-10')}>
          <TruncatedCell value={server.negotiated_protocol} href={detailHref} />
        </TableCell>
        <TableCell size="small" className={cn(COL.version, 'relative z-10')}>
          <TruncatedCell value={server.card_version} href={detailHref} />
        </TableCell>
        <TableCell size="small" className={COL.streaming}>
          {formatStreaming(server.streaming_supported)}
        </TableCell>
        <TableCell size="small" className={COL.skills}>
          {server.skill_count ?? EMPTY}
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
      className="min-w-[1120px] table-fixed border-separate border-spacing-x-2 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            <HeaderLabel label="Name" />
          </TableHead>
          <TableHead size="small">
            <HeaderLabel label="Description" />
          </TableHead>
          <TableHead size="small" className={COL.address}>
            <HeaderLabel label="Address" />
          </TableHead>
          <TableHead size="small" className={COL.statusMessage}>
            <HeaderLabel label="Status message" />
          </TableHead>
          <TableHead size="small" className={COL.protocol}>
            <HeaderLabel label="Protocol" />
          </TableHead>
          <TableHead size="small" className={COL.version}>
            <HeaderLabel label="Version" />
          </TableHead>
          <TableHead size="small" className={COL.streaming}>
            <HeaderLabel label="Streaming" />
          </TableHead>
          <TableHead size="small" className={COL.skills}>
            <HeaderLabel label="Skills" />
          </TableHead>
          <TableHead size="small" className={COL.status}>
            <HeaderLabel label="Status" />
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
