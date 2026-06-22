'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChatBubble, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import type { Tool } from '@/lib/services/tools';
import { cn } from '@/lib/utils';
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
  name: 'w-[240px] shrink-0',
  type: 'w-[120px] shrink-0',
  description: 'flex-1 min-w-0',
  action: 'w-[100px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

interface ToolTableRowProps {
  readonly tool: Tool;
  readonly usage: ToolUsage;
  readonly onDelete: (id: string) => void;
}

function ToolTableRow({ tool, usage, onDelete }: ToolTableRowProps) {
  const { readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const href = `/tools/${encodeURIComponent(tool.name)}`;
  const deleteDisabled = usage.inUse || readOnlyMode;

  return (
    <>
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover relative flex cursor-pointer items-center gap-x-4 transition-colors">
        <div role="cell" className={cn(rowCellClass, COL.name)}>
          <NamespacedLink
            href={href}
            title={tool.name}
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px] after:absolute after:inset-0 after:content-['']">
            {tool.name}
          </NamespacedLink>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.type)}>
          <span className="text-fg-secondary block truncate text-sm leading-5 tracking-[-0.112px]">
            {getToolTypeLabel(tool)}
          </span>
        </div>
        <OriginCell origin={tool.annotations?.[ARK_ANNOTATIONS.ORIGIN]} />
        <div
          role="cell"
          className={cn(rowCellClass, COL.description, 'relative z-10')}>
          {tool.description ? (
            <TruncatedTooltip label={tool.description}>
              <NamespacedLink
                href={href}
                tabIndex={-1}
                className="text-fg-primary block w-full truncate text-sm leading-5 tracking-[-0.112px]">
                {tool.description}
              </NamespacedLink>
            </TruncatedTooltip>
          ) : (
            <NamespacedLink
              href={href}
              tabIndex={-1}
              className="text-fg-secondary block w-full truncate text-sm leading-5 tracking-[-0.112px]">
              No description
            </NamespacedLink>
          )}
        </div>
        <div
          role="cell"
          className={cn(
            rowCellClass,
            COL.action,
            'relative z-10 justify-center gap-2',
          )}>
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
      </div>
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

export function ToolsTable({ tools, usage, onDelete }: ToolsTableProps) {
  return (
    <div role="table" aria-label="Tools" className="flex w-full flex-col">
      <div role="row" className="flex items-center gap-x-4">
        <div role="columnheader" className={cn(headerCellClass, COL.name)}>
          Name
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.type)}>
          Type
        </div>
        <OriginColumnHeader tooltip="Where the tool was first created" />
        <div
          role="columnheader"
          className={cn(headerCellClass, COL.description)}>
          Description
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {tools.map(tool => (
          <ToolTableRow
            key={tool.id}
            tool={tool}
            usage={usage[tool.name] ?? { inUse: false }}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
