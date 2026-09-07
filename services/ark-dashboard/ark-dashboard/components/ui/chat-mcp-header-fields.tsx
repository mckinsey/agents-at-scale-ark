'use client';

import { useState } from 'react';

import { Add, ChevronDown, Info, Lock, Trash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { HeaderNameField } from '@/components/ui/header-name-field';
import { HeaderOverrideSelect } from '@/components/ui/header-override-select';
import { IconShell } from '@/components/ui/icon-shell';
import {
  COLUMN_LABEL_CLASS,
  LabeledField,
} from '@/components/ui/labeled-field';
import { McpServerSelect } from '@/components/ui/mcp-server-select';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMcpSecretOptions } from '@/lib/hooks/use-mcp-secret-options';
import { useMcpServerHeaders } from '@/lib/hooks/use-mcp-server-headers';
import type { AgentHeaderSummary } from '@/lib/hooks/use-query-mcp-headers';
import { cn } from '@/lib/utils';
import {
  type McpHeaderRow,
  type McpHeaderSource,
  isSensitiveHeaderName,
} from '@/lib/utils/mcp-header-overrides';

const PRECEDENCE_TOOLTIP =
  'Header overrides set here apply to this query only and take precedence over the same header on the agent. The agent keeps its own value for every other query.';

const SOURCE_ITEMS: { value: McpHeaderSource; label: string }[] = [
  { value: 'secretKeyRef', label: 'Secret' },
  { value: 'value', label: 'Plain value' },
];

const inputClass =
  'text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50';

const underlineClass =
  'focus-within:border-b-stroke-status-focus flex h-10 min-w-0 items-center border-b border-white/[0.16]';

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
  const [advancedRows, setAdvancedRows] = useState<Record<string, boolean>>({});

  const {
    options,
    secretNames,
    loaded: secretsLoaded,
  } = useMcpSecretOptions(expanded);

  const { headerNamesByServer, allHeaderNames } = useMcpServerHeaders(
    serverNames,
    expanded,
  );

  const declaredNamesFor = (row: McpHeaderRow) => {
    const fromServer = row.serverName
      ? (headerNamesByServer[row.serverName] ?? [])
      : allHeaderNames;
    const fromAgent = agentHeaders
      .map(header => header.name)
      .filter(name => !!name);
    return Array.from(new Set([...fromAgent, ...fromServer]));
  };

  const isAdvanced = (row: McpHeaderRow) =>
    row.source !== 'secretKeyRef' || advancedRows[row.id] === true;

  const revealAdvanced = (rowId: string) =>
    setAdvancedRows(prev => ({ ...prev, [rowId]: true }));

  const effectiveCount =
    agentHeaders.filter(header => !header.shadowed).length + rows.length;

  const secretItems = secretNames.map(name => ({ value: name, label: name }));

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

              {rows.map(row => {
                const keyItems = options
                  .filter(option => option.secretName === row.secretName)
                  .map(option => ({
                    value: option.secretKey,
                    label: option.secretKey,
                  }));

                return (
                  <div key={row.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
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
                          suggestions={declaredNamesFor(row)}
                          disabled={disabled}
                          onChange={name => onUpdateRow(row.id, { name })}
                          className="w-full"
                        />
                      </div>

                      <div className="flex min-w-0 flex-1 items-center">
                        {isAdvanced(row) ? (
                          <Select
                            items={SOURCE_ITEMS}
                            value={row.source}
                            onValueChange={value =>
                              onUpdateRow(row.id, {
                                source: String(value) as McpHeaderSource,
                              })
                            }
                            disabled={disabled}>
                            <SelectTrigger
                              id={`mcp-${row.id}-source`}
                              aria-label="Header override"
                              className={cn(
                                GHOST_TRIGGER,
                                'h-10 w-full min-w-0',
                              )}>
                              <SelectValue placeholder="Select source" />
                            </SelectTrigger>
                            <SelectContent className="bg-fill-onsurface-ui-2">
                              {SOURCE_ITEMS.map(item => (
                                <SelectItem key={item.value} value={item.value}>
                                  <SelectItemText>{item.label}</SelectItemText>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
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
                            onSelectAdvanced={() => revealAdvanced(row.id)}
                            className="w-full"
                          />
                        )}
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

                    {isAdvanced(row) && (
                      <div className="grid grid-cols-2 items-start gap-3">
                        {row.source === 'secretKeyRef' ? (
                          <>
                            <LabeledField
                              id={`mcp-${row.id}-secret-name`}
                              label="Secret">
                              <Select
                                items={secretItems}
                                value={row.secretName || undefined}
                                onValueChange={value =>
                                  onUpdateRow(row.id, {
                                    secretName: String(value),
                                    secretKey: '',
                                  })
                                }
                                disabled={disabled}>
                                <SelectTrigger
                                  id={`mcp-${row.id}-secret-name`}
                                  className={cn(
                                    GHOST_TRIGGER,
                                    'h-10 w-full min-w-0',
                                  )}>
                                  <SelectValue placeholder="Select secret" />
                                </SelectTrigger>
                                <SelectContent className="bg-fill-onsurface-ui-2">
                                  {secretItems.map(item => (
                                    <SelectItem
                                      key={item.value}
                                      value={item.value}>
                                      <SelectItemText>
                                        {item.label}
                                      </SelectItemText>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </LabeledField>
                            <LabeledField
                              id={`mcp-${row.id}-secret-key`}
                              label="Key in secret">
                              <Select
                                items={keyItems}
                                value={row.secretKey || undefined}
                                onValueChange={value =>
                                  onUpdateRow(row.id, {
                                    secretKey: String(value),
                                  })
                                }
                                disabled={disabled || !row.secretName}>
                                <SelectTrigger
                                  id={`mcp-${row.id}-secret-key`}
                                  className={cn(
                                    GHOST_TRIGGER,
                                    'h-10 w-full min-w-0',
                                  )}>
                                  <SelectValue placeholder="Select key" />
                                </SelectTrigger>
                                <SelectContent className="bg-fill-onsurface-ui-2">
                                  {keyItems.map(item => (
                                    <SelectItem
                                      key={item.value}
                                      value={item.value}>
                                      <SelectItemText>
                                        {item.label}
                                      </SelectItemText>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </LabeledField>
                          </>
                        ) : (
                          <LabeledField
                            id={`mcp-${row.id}-value`}
                            label="Value"
                            className="col-span-2">
                            <div className={underlineClass}>
                              <input
                                id={`mcp-${row.id}-value`}
                                type="text"
                                value={row.value}
                                onChange={event =>
                                  onUpdateRow(row.id, {
                                    value: event.target.value,
                                  })
                                }
                                placeholder="Header value"
                                disabled={disabled}
                                className={inputClass}
                              />
                            </div>
                          </LabeledField>
                        )}

                        {row.source === 'value' &&
                          isSensitiveHeaderName(row.name) && (
                            <span className="text-status-warning col-span-2 text-xs">
                              Sent in plain text with this query. A secret is
                              safer.
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
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
