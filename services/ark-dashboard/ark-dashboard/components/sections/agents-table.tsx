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
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { Agent } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { OriginCell, OriginColumnHeader } from './origin-column';

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
  name: 'w-[240px]',
  status: 'w-[120px]',
  action: 'w-[100px]',
};

function AgentStatus({
  status,
}: Readonly<{ status?: Agent['available'] | null }>) {
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

function AgentTableRow({ agent, onDelete }: Readonly<AgentTableRowProps>) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(agent.name);
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <NamespacedLink
            href={`/agents/${encodeURIComponent(agent.name)}`}
            title={agent.name}
            className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
            {agent.name}
          </NamespacedLink>
        </TableCell>
        <OriginCell origin={agent.annotations?.[ARK_ANNOTATIONS.ORIGIN]} />
        <TableCell size="small" className="relative z-10">
          {agent.description ? (
            <TruncatedTooltip label={agent.description}>
              <NamespacedLink
                href={`/agents/${encodeURIComponent(agent.name)}`}
                tabIndex={-1}
                className="text-fg-primary block w-full truncate">
                {agent.description}
              </NamespacedLink>
            </TruncatedTooltip>
          ) : (
            <NamespacedLink
              href={`/agents/${encodeURIComponent(agent.name)}`}
              tabIndex={-1}
              className="text-fg-primary block w-full truncate">
              No description
            </NamespacedLink>
          )}
        </TableCell>
        <TableCell size="small">
          <AgentStatus status={agent.available} />
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="Chat with agent"
              className={cn(isChatOpen && 'text-brand-accents-qb-accent')}
              onClick={() => toggleFloatingChat(agent.name, 'agent')}>
              <ChatBubble />
            </IconActionButton>
            <IconActionButton
              label="Delete agent"
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

export function AgentsTable({ agents, onDelete }: Readonly<AgentsTableProps>) {
  return (
    <Table
      aria-label="Agents"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <OriginColumnHeader tooltip="Where the agent was first created" />
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.status}>
            Status
          </TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map(agent => (
          <AgentTableRow key={agent.id} agent={agent} onDelete={onDelete} />
        ))}
      </TableBody>
    </Table>
  );
}
