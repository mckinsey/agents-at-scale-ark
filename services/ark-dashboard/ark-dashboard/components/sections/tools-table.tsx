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
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { Tool } from '@/lib/services/tools';
import { useNamespace } from '@/providers/NamespaceProvider';

import { OriginCell, OriginColumnHeader } from './origin-column';

export type ToolTypeKey = 'built-in' | 'mcp' | 'agent' | 'team';

const TOOL_TYPE_LABELS: Record<ToolTypeKey, string> = {
  'built-in': 'Built-in',
  mcp: 'MCP',
  agent: 'Agent',
  team: 'Team',
};

export function getToolTypeKey(tool: Tool): ToolTypeKey {
  switch (tool.type) {
    case 'mcp':
      return 'mcp';
    case 'agent':
      return 'agent';
    case 'team':
      return 'team';
    default:
      return 'built-in';
  }
}

export function getToolTypeLabel(tool: Tool): string {
  return TOOL_TYPE_LABELS[getToolTypeKey(tool)];
}

interface ToolUsage {
  readonly inUse: boolean;
  readonly reason?: string;
}

interface ToolsTableProps {
  readonly tools: readonly Tool[];
  readonly usage: Record<string, ToolUsage>;
  readonly onDelete: (id: string) => void;
}

const COL = {
  name: 'w-[240px]',
  type: 'w-[120px]',
  action: 'w-[100px]',
};

const rowHoverOverlayClass =
  'pointer-events-none absolute inset-0 -z-10 transition-colors group-hover:bg-stateslayer-overlay-hover';

interface ToolTableRowProps {
  readonly tool: Tool;
  readonly usage: ToolUsage;
  readonly onDelete: (id: string) => void;
}

function ToolTableRow({ tool, usage, onDelete }: Readonly<ToolTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const href = `/tools/${encodeURIComponent(tool.name)}`;
  const deleteDisabled = usage.inUse || readOnlyMode;

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <NamespacedLink
            href={href}
            title={tool.name}
            className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
            {tool.name}
          </NamespacedLink>
        </TableCell>
        <TableCell size="small" className={COL.type}>
          <span className="text-fg-secondary block truncate">
            {getToolTypeLabel(tool)}
          </span>
        </TableCell>
        <OriginCell origin={tool.annotations?.[ARK_ANNOTATIONS.ORIGIN]} />
        <TableCell size="small" className="relative z-10">
          {tool.description ? (
            <TruncatedTooltip label={tool.description}>
              <NamespacedLink
                href={href}
                tabIndex={-1}
                className="text-fg-primary block w-full truncate">
                {tool.description}
              </NamespacedLink>
            </TruncatedTooltip>
          ) : (
            <NamespacedLink
              href={href}
              tabIndex={-1}
              className="text-fg-secondary block w-full truncate">
              No description
            </NamespacedLink>
          )}
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="Query tool"
              onClick={() => push(`/query/new?target_tool=${tool.name}`)}>
              <ChatBubble />
            </IconActionButton>
            <IconActionButton
              label="Delete tool"
              tooltip={
                usage.inUse
                  ? (usage.reason ?? 'Tool is used by agents')
                  : 'Delete tool'
              }
              disabled={deleteDisabled}
              onClick={() => {
                if (!deleteDisabled) setDeleteConfirmOpen(true);
              }}>
              <Trash />
            </IconActionButton>
          </div>
        </TableCell>
      </TableRow>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Tool"
        description={`Do you want to delete "${tool.name || tool.type || 'this tool'}" tool? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(tool.id)}
        variant="destructive"
      />
    </>
  );
}

export function ToolsTable({
  tools,
  usage,
  onDelete,
}: Readonly<ToolsTableProps>) {
  return (
    <Table
      aria-label="Tools"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small" className={COL.type}>
            Type
          </TableHead>
          <OriginColumnHeader tooltip="Where the tool was first created" />
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tools.map(tool => (
          <ToolTableRow
            key={tool.id}
            tool={tool}
            usage={usage[tool.name] ?? { inUse: false }}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
