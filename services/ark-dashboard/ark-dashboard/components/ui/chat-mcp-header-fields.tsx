'use client';

import { useState } from 'react';

import { Add, ChevronDown, Info } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  McpHeaderColumnLabels,
  McpHeaderRowFields,
} from '@/components/ui/mcp-header-row';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type SecretKeyOption,
  useSecretKeyOptions,
} from '@/lib/hooks/use-secret-key-options';
import { cn } from '@/lib/utils';
import type {
  HeaderNamesForServer,
  McpHeaderRow,
  McpHeaderRowError,
  ServerIssueForServer,
} from '@/lib/utils/mcp-header-overrides';

const PRECEDENCE_TOOLTIP =
  'Header overrides set here apply to this query only and take precedence over the same header on the agent. The agent keeps its own value for every other query.';

function secretOptionsFor(
  row: McpHeaderRow,
  options: SecretKeyOption[],
): SecretKeyOption[] {
  return row.serverName
    ? options
    : options.filter(option => option.scope !== 'personal');
}

function withPersonalSecretCleared(
  row: McpHeaderRow,
  updates: Partial<McpHeaderRow>,
  options: SecretKeyOption[],
): Partial<McpHeaderRow> {
  const movesToAllServers = 'serverName' in updates && !updates.serverName;
  const usesPersonalSecret = options.some(
    option =>
      option.scope === 'personal' &&
      option.secretName === row.secretName &&
      option.secretKey === row.secretKey,
  );
  return movesToAllServers && usesPersonalSecret
    ? { ...updates, secretName: '', secretKey: '' }
    : updates;
}

export interface ChatMcpHeaderFieldsProps {
  readonly rows: McpHeaderRow[];
  readonly nameOptionsFor: (row: McpHeaderRow) => string[];
  readonly namesForServer: HeaderNamesForServer;
  readonly serverIssueFor?: ServerIssueForServer;
  readonly canAddRow: boolean;
  readonly errors: Record<string, McpHeaderRowError>;
  readonly serverNames: string[];
  readonly effectiveCount: number;
  readonly hasErrors?: boolean;
  readonly onAddRow: () => void;
  readonly onUpdateRow: (id: string, updates: Partial<McpHeaderRow>) => void;
  readonly onRemoveRow: (id: string) => void;
  readonly disabled?: boolean;
}

export function ChatMcpHeaderFields({
  rows,
  nameOptionsFor,
  namesForServer,
  serverIssueFor,
  canAddRow,
  errors,
  serverNames,
  effectiveCount,
  hasErrors,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  disabled,
}: ChatMcpHeaderFieldsProps) {
  const [expanded, setExpanded] = useState(false);
  const { options, loaded } = useSecretKeyOptions({
    scope: 'all',
    enabled: expanded,
  });

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="chat-mcp-header-overrides">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-fg-secondary gap-2 px-0">
          <IconShell
            size="sm"
            className={cn('transition-transform', expanded && 'rotate-180')}>
            <ChevronDown />
          </IconShell>
          MCP header overrides
          <span
            className="text-fg-tertiary text-xs"
            data-testid="chat-mcp-header-effective-count">
            {effectiveCount} effective
          </span>
          {hasErrors && !expanded && (
            <span className="text-status-error text-xs">Fix to send</span>
          )}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="How header override precedence works"
              className="text-fg-secondary cursor-help">
              <Info className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-wrap">
            {PRECEDENCE_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-fg-tertiary text-xs tracking-wide uppercase">
                This query only
              </span>
              <McpHeaderColumnLabels />
              {rows.map(row => (
                <McpHeaderRowFields
                  key={row.id}
                  row={row}
                  serverNames={serverNames}
                  nameOptions={nameOptionsFor(row)}
                  namesForServer={namesForServer}
                  serverIssueFor={serverIssueFor}
                  secretOptions={secretOptionsFor(row, options)}
                  secretsLoaded={loaded}
                  error={errors[row.id]}
                  disabled={disabled}
                  onChange={updates =>
                    onUpdateRow(
                      row.id,
                      withPersonalSecretCleared(row, updates, options),
                    )
                  }
                  onRemove={() => onRemoveRow(row.id)}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={onAddRow}
            disabled={disabled || !canAddRow}>
            <Add className="size-4" />
            Add new
          </Button>
        </div>
      )}
    </div>
  );
}
