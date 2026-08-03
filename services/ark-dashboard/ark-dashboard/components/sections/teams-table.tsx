'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChatBubble, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
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
import { useChatState } from '@/lib/chat-context';
import { toggleFloatingChat } from '@/lib/chat-events';
import type { Team } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

interface TeamsTableProps {
  readonly teams: readonly Team[];
  readonly onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: { label: 'Unknown', dotClass: 'bg-fg-tertiary' },
} as const;

const COL = {
  name: 'w-[240px]',
  members: 'w-[180px]',
  status: 'w-[120px]',
  action: 'w-[100px]',
};

function TeamStatus({
  status,
}: Readonly<{ status?: Team['available'] | null }>) {
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

interface TeamTableRowProps {
  readonly team: Team;
  readonly onDelete: (id: string) => void;
}

export function TeamTableRow({ team, onDelete }: Readonly<TeamTableRowProps>) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(team.name);
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const memberCount = team.members?.length ?? 0;
  const memberLabel = memberCount === 1 ? 'member' : 'members';
  const strategyLabel =
    team.strategy === 'sequential' && team.loops
      ? 'sequential (loops)'
      : team.strategy;

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <NamespacedLink
            href={`/teams/${encodeURIComponent(team.name)}`}
            title={team.name}
            className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
            {team.name}
          </NamespacedLink>
        </TableCell>
        <TableCell size="small" className="relative z-10">
          {team.description ? (
            <TruncatedTooltip label={team.description}>
              <NamespacedLink
                href={`/teams/${encodeURIComponent(team.name)}`}
                tabIndex={-1}
                className="text-fg-primary block w-full truncate">
                {team.description}
              </NamespacedLink>
            </TruncatedTooltip>
          ) : (
            <NamespacedLink
              href={`/teams/${encodeURIComponent(team.name)}`}
              tabIndex={-1}
              className="text-fg-primary block w-full truncate">
              No description
            </NamespacedLink>
          )}
        </TableCell>
        <TableCell size="small" className={COL.members}>
          <span
            className="text-fg-secondary block truncate"
            title={`${memberCount} ${memberLabel} · ${strategyLabel}`}>
            {memberCount} {memberLabel} · {strategyLabel}
          </span>
        </TableCell>
        <TableCell size="small">
          <TeamStatus status={team.available} />
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="Chat with team"
              className={cn(isChatOpen && 'text-brand-accents-qb-accent')}
              onClick={() => toggleFloatingChat(team.name, 'team')}>
              <ChatBubble />
            </IconActionButton>
            <IconActionButton
              label="Delete team"
              disabled={isChatOpen || readOnlyMode}
              onClick={() => {
                if (!isChatOpen && !readOnlyMode) setDeleteConfirmOpen(true);
              }}>
              <Trash />
            </IconActionButton>
          </div>
        </TableCell>
      </TableRow>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Team"
        description={`Do you want to delete "${team.name}" team? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(team.id)}
        variant="destructive"
      />
    </>
  );
}

export function TeamsTable({ teams, onDelete }: Readonly<TeamsTableProps>) {
  return (
    <Table
      aria-label="Teams"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.members}>
            Members
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
        {teams.map(team => (
          <TeamTableRow key={team.id} team={team} onDelete={onDelete} />
        ))}
      </TableBody>
    </Table>
  );
}
