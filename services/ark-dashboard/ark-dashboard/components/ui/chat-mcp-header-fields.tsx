'use client';

import { useState } from 'react';

import { Add, ChevronDown, Info, Lock, Trash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { HeaderNameField } from '@/components/ui/header-name-field';
import { HeaderOverrideSelect } from '@/components/ui/header-override-select';
import { IconShell } from '@/components/ui/icon-shell';
import { COLUMN_LABEL_CLASS } from '@/components/ui/labeled-field';
import { McpServerSelect } from '@/components/ui/mcp-server-select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMcpSecretOptions } from '@/lib/hooks/use-mcp-secret-options';
import type { AgentHeaderSummary } from '@/lib/hooks/use-query-mcp-headers';
import { cn } from '@/lib/utils';
import type { McpHeaderRow } from '@/lib/utils/mcp-header-overrides';

const PRECEDENCE_TOOLTIP =
  'Header overrides set here apply to this query only and take precedence over the same header on the agent. The agent keeps its own value for every other query.';

export interface ChatMcpHeaderFieldsProps {
  readonly agentHeaders: AgentHeaderSummary[];
  readonly rows: McpHeaderRow[];
  readonly serverNames?: string[];
  readonly onAddRow: () => void;
  readonly onUpdateRow: (id: string, updates: Partial<McpHeaderRow>) => void;
  readonly onRemoveRow: (id: string) => void;
  readonly disabled?: boolean;
}

export function ChatMcpHeaderFields({
  agentHeaders,
  rows,
  serverNames = [],
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  disabled,
}: ChatMcpHeaderFieldsProps) {
  const [expanded, setExpanded] = useState(false);

  const { options, loaded: secretsLoaded } = useMcpSecretOptions(expanded);

  const effectiveCount =
    agentHeaders.filter(header => !header.shadowed).length + rows.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-fg-secondary inline-flex items-center gap-2 text-sm">
          <IconShell
            size="sm"
            className={cn('transition-transform', expanded && 'rotate-180')}>
            <ChevronDown />
          </IconShell>
          Header overrides
          <span className="text-fg-tertiary text-xs">
            {effectiveCount} effective
          </span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How header override precedence works"
              className="text-fg-secondary inline-flex cursor-help p-0">
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {PRECEDENCE_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          {agentHeaders.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-fg-tertiary text-xs uppercase tracking-wide">
                From this agent
              </span>
              {agentHeaders.map(header => (
                <div
                  key={header.id}
                  className="flex h-9 items-center gap-2 border-b border-white/[0.16]">
                  <span
                    className={cn(
                      'text-fg-primary min-w-0 flex-1 truncate text-sm',
                      header.shadowed &&
                        'text-fg-tertiary line-through decoration-1',
                    )}>
                    {header.name || 'Unnamed header'}
                  </span>
                  <span className="text-fg-tertiary shrink-0 text-xs">
                    {header.sourceLabel}
                  </span>
                  <span className="text-fg-tertiary shrink-0 text-xs">
                    {header.scope}
                  </span>
                  {header.shadowed ? (
                    <span className="text-status-warning shrink-0 text-xs">
                      overridden below
                    </span>
                  ) : (
                    <span className="text-fg-tertiary inline-flex shrink-0 items-center gap-1 text-xs">
                      <Lock className="size-3 shrink-0" />
                      from agent
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-fg-tertiary text-xs uppercase tracking-wide">
                This query only
              </span>
              <div className="flex items-center gap-3">
                <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
                  MCP server
                </span>
                <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
                  Header name
                </span>
                <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
                  Header override
                </span>
                <span className="w-8 shrink-0" />
              </div>

              {rows.map(row => (
                <div key={row.id} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center">
                    <McpServerSelect
                      id={`mcp-${row.id}-server`}
                      serverNames={serverNames}
                      value={row.serverName}
                      disabled={disabled}
                      onChange={serverName =>
                        onUpdateRow(row.id, { serverName })
                      }
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 items-center">
                    <HeaderNameField
                      id={`mcp-${row.id}-name`}
                      value={row.name}
                      disabled={disabled}
                      onChange={name => onUpdateRow(row.id, { name })}
                      className="w-full"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 items-center">
                    <HeaderOverrideSelect
                      hideLabel
                      id={`mcp-${row.id}-override`}
                      options={options}
                      loaded={secretsLoaded}
                      secretName={row.secretName}
                      secretKey={row.secretKey}
                      disabled={disabled}
                      onSelectSecret={(secretName, secretKey) =>
                        onUpdateRow(row.id, {
                          source: 'secretKeyRef',
                          secretName,
                          secretKey,
                        })
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="flex h-10 w-8 shrink-0 items-center justify-center border-b border-white/[0.16]">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.id)}
                      disabled={disabled}
                      aria-label="Remove header override"
                      className="text-fg-secondary hover:text-status-error transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                      <Trash className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={onAddRow}
            disabled={disabled}>
            <Add className="size-4" />
            Override a header
          </Button>
        </div>
      )}
    </div>
  );
}
