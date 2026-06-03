'use client';

import { type ReactNode, useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChatBubble, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
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
  name: 'w-[240px] shrink-0',
  description: 'flex-1 min-w-0',
  members: 'w-[180px] shrink-0',
  status: 'w-[120px] shrink-0',
  action: 'w-[100px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

function TeamStatus({ status }: { status?: Team['available'] | null }) {
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
  readonly leading?: ReactNode;
}

export function TeamTableRow({ team, onDelete, leading }: TeamTableRowProps) {
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
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover relative flex cursor-pointer items-center gap-x-4 transition-colors">
        {leading && (
          <span
            className="relative z-10 flex shrink-0 items-center"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}>
            {leading}
          </span>
        )}
        <div role="cell" className={cn(rowCellClass, COL.name)}>
          <NamespacedLink
            href={`/teams/${encodeURIComponent(team.name)}`}
            title={team.name}
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px] after:absolute after:inset-0 after:content-['']">
            {team.name}
          </NamespacedLink>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.description)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={team.description || ''}>
            {team.description || 'No description'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.members)}>
          <span
            className="text-fg-secondary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={`${memberCount} ${memberLabel} · ${strategyLabel}`}>
            {memberCount} {memberLabel} · {strategyLabel}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.status)}>
          <TeamStatus status={team.available} />
        </div>
        <div
          role="cell"
          className={cn(
            rowCellClass,
            COL.action,
            'relative z-10 justify-center gap-2',
          )}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Chat with team"
            className={cn(isChatOpen && 'text-brand-accents-qb-accent')}
            onClick={() => toggleFloatingChat(team.name, 'team')}>
            <IconShell size="sm" variant="secondary">
              <ChatBubble />
            </IconShell>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete team"
            disabled={isChatOpen || readOnlyMode}
            onClick={() => {
              if (!isChatOpen && !readOnlyMode) setDeleteConfirmOpen(true);
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

export function TeamsTable({ teams, onDelete }: TeamsTableProps) {
  return (
    <div
      role="table"
      aria-label="Teams"
      className="flex w-full flex-col">
      <div
        role="row"
        className="flex items-center gap-x-4">
        <div role="columnheader" className={cn(headerCellClass, COL.name)}>
          Name
        </div>
        <div
          role="columnheader"
          className={cn(headerCellClass, COL.description)}>
          Description
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.members)}>
          Members
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.status)}>
          Status
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {teams.map(team => (
          <TeamTableRow key={team.id} team={team} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
