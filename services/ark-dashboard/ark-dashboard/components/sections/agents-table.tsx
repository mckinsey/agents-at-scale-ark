'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChatBubble, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { useChatState } from '@/lib/chat-context';
import { toggleFloatingChat } from '@/lib/chat-events';
import type { Agent } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

interface AgentsTableProps {
  readonly agents: readonly Agent[];
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
  status: 'w-[120px] shrink-0',
  action: 'w-[100px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

function AgentStatus({ status }: { status?: Agent['available'] | null }) {
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

interface AgentTableRowProps {
  readonly agent: Agent;
  readonly onDelete: (id: string) => void;
}

function AgentTableRow({ agent, onDelete }: AgentTableRowProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(agent.name);
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover relative flex cursor-pointer items-center gap-x-4 transition-colors">
        <div role="cell" className={cn(rowCellClass, COL.name)}>
          <NamespacedLink
            href={`/agents/${encodeURIComponent(agent.name)}`}
            title={agent.name}
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px] after:absolute after:inset-0 after:content-['']">
            {agent.name}
          </NamespacedLink>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.description)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={agent.description || ''}>
            {agent.description || 'No description'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.status)}>
          <AgentStatus status={agent.available} />
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
            aria-label="Chat with agent"
            className={cn(isChatOpen && 'text-brand-accents-qb-accent')}
            onClick={() => toggleFloatingChat(agent.name, 'agent')}>
            <IconShell size="sm" variant="secondary">
              <ChatBubble />
            </IconShell>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete agent"
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
        title="Delete Agent"
        description={`Do you want to delete "${agent.name}" agent? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(agent.id)}
        variant="destructive"
      />
    </>
  );
}

export function AgentsTable({ agents, onDelete }: AgentsTableProps) {
  return (
    <div
      role="table"
      aria-label="Agents"
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
        <div role="columnheader" className={cn(headerCellClass, COL.status)}>
          Status
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {agents.map(agent => (
          <AgentTableRow
            key={agent.id}
            agent={agent}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
