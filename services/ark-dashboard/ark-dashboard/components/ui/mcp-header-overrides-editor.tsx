'use client';

import { useCallback, useMemo } from 'react';

import { Add, Info, OpenInNew, Trash, VpnKey } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { COLUMN_LABEL_CLASS } from '@/components/ui/labeled-field';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMcpSecretOptions } from '@/lib/hooks/use-mcp-secret-options';
import { cn } from '@/lib/utils';
import {
  type McpHeaderRow,
  type McpOverrideGroup,
  addHeaderRow,
  countHeaders,
  describeScope,
} from '@/lib/utils/mcp-header-overrides';

import { HeaderNameField } from './header-name-field';
import { HeaderOverrideSelect } from './header-override-select';
import { McpServerSelect } from './mcp-server-select';

const HEADERS_TOOLTIP_TEXT =
  'Header overrides are added to every call this agent makes to a matching MCP server. Use a secret for tokens so the value is never stored on the agent itself. A query can override any header set here.';

const underlineClass =
  'focus-within:border-b-stroke-status-focus flex h-10 min-w-0 items-center border-b border-white/[0.16]';

function describeStoredOverride(header: McpHeaderRow): string {
  if (header.source === 'configMapKeyRef') {
    return `ConfigMap · ${header.configMapName}/${header.configMapKey}`;
  }
  if (header.source === 'queryParameterRef') {
    return `Query parameter · ${header.queryParameterName}`;
  }
  return 'Plain value';
}

export interface McpHeaderOverridesEditorProps {
  readonly groups: McpOverrideGroup[];
  readonly onChange: (groups: McpOverrideGroup[]) => void;
  readonly serverNames?: string[];
  readonly disabled?: boolean;
  readonly className?: string;
}

export function McpHeaderOverridesEditor({
  groups,
  onChange,
  serverNames = [],
  disabled,
  className,
}: McpHeaderOverridesEditorProps) {
  const { options, loaded: secretsLoaded } = useMcpSecretOptions();

  const updateHeader = useCallback(
    (groupId: string, headerId: string, updates: Partial<McpHeaderRow>) => {
      onChange(
        groups.map(group =>
          group.id === groupId
            ? {
                ...group,
                headers: group.headers.map(header =>
                  header.id === headerId ? { ...header, ...updates } : header,
                ),
              }
            : group,
        ),
      );
    },
    [groups, onChange],
  );

  const removeHeader = useCallback(
    (groupId: string, headerId: string) => {
      onChange(
        groups.reduce<McpOverrideGroup[]>((acc, group) => {
          if (group.id !== groupId) {
            acc.push(group);
            return acc;
          }

          const headers = group.headers.filter(
            header => header.id !== headerId,
          );
          if (headers.length > 0) acc.push({ ...group, headers });
          return acc;
        }, []),
      );
    },
    [groups, onChange],
  );

  const addRule = useCallback(() => {
    onChange(addHeaderRow(groups));
  }, [groups, onChange]);

  const rows = useMemo(
    () =>
      groups.flatMap(group =>
        group.headers.map(header => ({ group, header })),
      ),
    [groups],
  );

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex w-full items-start justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-fg-secondary label-regular-primary">
              Header overrides
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How header overrides work"
                  className="text-fg-secondary inline-flex cursor-help p-0">
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {HEADERS_TOOLTIP_TEXT}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-fg-secondary text-xs leading-4 tracking-[0.024px]">
            {countHeaders(groups)} header
            {countHeaders(groups) === 1 ? '' : 's'}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={addRule}
          disabled={disabled}>
          <Add className="size-4" />
          Add rule
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="border-stroke-tertiary flex flex-col gap-2 border border-dashed p-4">
          <p className="text-fg-secondary text-sm">
            No header overrides are sent to MCP servers. Select an MCP tool and
            a header appears here for its server.
          </p>
          <div className="flex items-center gap-1">
            <NamespacedLink
              href="/secrets"
              className="text-fg-secondary inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80">
              <IconShell size="sm">
                <VpnKey />
              </IconShell>
              Manage secrets
              <IconShell size="sm">
                <OpenInNew />
              </IconShell>
            </NamespacedLink>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
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

          {rows.map(({ group, header }) => (
            <div key={header.id} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center">
                {group.matchLabels.length > 0 ? (
                  <div className={cn(underlineClass, 'w-full')}>
                    <span className="text-fg-secondary min-w-0 truncate text-sm">
                      {describeScope(group)}
                    </span>
                  </div>
                ) : (
                  <McpServerSelect
                    id={`mcp-${header.id}-server`}
                    serverNames={serverNames}
                    value={header.serverName}
                    disabled={disabled}
                    onChange={serverName =>
                      updateHeader(group.id, header.id, { serverName })
                    }
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center">
                <HeaderNameField
                  id={`mcp-${header.id}-name`}
                  value={header.name}
                  disabled={disabled}
                  onChange={name =>
                    updateHeader(group.id, header.id, { name })
                  }
                  className="w-full"
                />
              </div>

              <div className="flex min-w-0 flex-1 items-center">
                {header.source === 'secretKeyRef' ? (
                  <HeaderOverrideSelect
                    hideLabel
                    id={`mcp-${header.id}-override`}
                    options={options}
                    loaded={secretsLoaded}
                    secretName={header.secretName}
                    secretKey={header.secretKey}
                    disabled={disabled}
                    onSelectSecret={(secretName, secretKey) =>
                      updateHeader(group.id, header.id, {
                        source: 'secretKeyRef',
                        secretName,
                        secretKey,
                      })
                    }
                    className="w-full"
                  />
                ) : (
                  <div className={cn(underlineClass, 'w-full')}>
                    <span className="text-fg-secondary min-w-0 truncate text-sm">
                      {describeStoredOverride(header)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex h-10 w-8 shrink-0 items-center justify-center border-b border-white/[0.16]">
                <button
                  type="button"
                  onClick={() => removeHeader(group.id, header.id)}
                  disabled={disabled}
                  aria-label="Remove header override"
                  className="text-fg-secondary hover:text-status-error transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash className="size-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-fg-tertiary text-xs">
              Ark applies header overrides to every MCP server unless the rule
              is narrowed by labels.
            </span>
            <NamespacedLink
              href="/secrets"
              className="text-fg-secondary inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:opacity-80">
              <IconShell size="sm">
                <VpnKey />
              </IconShell>
              Create a secret
            </NamespacedLink>
          </div>
        </div>
      )}
    </div>
  );
}
