'use client';

import { useCallback, useMemo, useState } from 'react';

import { Add, Info, OpenInNew, Trash, VpnKey, Warning } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  COLUMN_LABEL_CLASS,
  LabeledField,
} from '@/components/ui/labeled-field';
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
import { cn } from '@/lib/utils';
import {
  type McpHeaderRow,
  type McpHeaderSource,
  type McpOverrideGroup,
  addHeaderRow,
  countHeaders,
  describeScope,
  isSensitiveHeaderName,
} from '@/lib/utils/mcp-header-overrides';

import { HeaderNameField } from './header-name-field';
import { HeaderOverrideSelect } from './header-override-select';
import { McpServerSelect } from './mcp-server-select';

const HEADERS_TOOLTIP_TEXT =
  'Header overrides are added to every call this agent makes to a matching MCP server. Use a secret for tokens so the value is never stored on the agent itself. A query can override any header set here.';

const SOURCE_ITEMS: { value: McpHeaderSource; label: string }[] = [
  { value: 'secretKeyRef', label: 'Secret' },
  { value: 'value', label: 'Plain value' },
  { value: 'queryParameterRef', label: 'Query parameter' },
  { value: 'configMapKeyRef', label: 'ConfigMap' },
];

const inputClass =
  'text-fg-primary placeholder:text-fg-secondary min-w-0 flex-1 bg-transparent text-sm leading-4 tracking-[-0.112px] outline-none disabled:cursor-not-allowed disabled:opacity-50';

const underlineClass =
  'focus-within:border-b-stroke-status-focus flex h-10 min-w-0 items-center border-b border-white/[0.16]';

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
  const { options, secretNames, loaded: secretsLoaded } = useMcpSecretOptions();
  const { headerNamesByServer, allHeaderNames } =
    useMcpServerHeaders(serverNames);
  const [advancedRows, setAdvancedRows] = useState<Record<string, boolean>>({});

  const declaredNamesFor = useCallback(
    (header: McpHeaderRow) =>
      header.serverName
        ? (headerNamesByServer[header.serverName] ?? [])
        : allHeaderNames,
    [headerNamesByServer, allHeaderNames],
  );

  const revealAdvanced = useCallback((headerId: string) => {
    setAdvancedRows(prev => ({ ...prev, [headerId]: true }));
  }, []);

  const isAdvanced = useCallback(
    (header: McpHeaderRow) =>
      header.source !== 'secretKeyRef' || advancedRows[header.id] === true,
    [advancedRows],
  );

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

  const secretItems = useMemo(
    () => secretNames.map(name => ({ value: name, label: name })),
    [secretNames],
  );

  const renderValueFields = (group: McpOverrideGroup, header: McpHeaderRow) => {
    if (header.source === 'secretKeyRef') {
      const keyItems = options
        .filter(option => option.secretName === header.secretName)
        .map(option => ({ value: option.secretKey, label: option.secretKey }));
      const secretMissing =
        secretsLoaded &&
        !!header.secretName &&
        !secretNames.includes(header.secretName);

      return (
        <>
          <LabeledField id={`mcp-${header.id}-secret-name`} label="Secret">
            <Select
              items={secretItems}
              value={header.secretName || undefined}
              onValueChange={value =>
                updateHeader(group.id, header.id, {
                  secretName: String(value),
                  secretKey: '',
                })
              }
              disabled={disabled}>
              <SelectTrigger
                id={`mcp-${header.id}-secret-name`}
                className={cn(GHOST_TRIGGER, 'h-10 w-full min-w-0')}>
                <SelectValue placeholder="Select secret" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {secretItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          <LabeledField id={`mcp-${header.id}-secret-key`} label="Key in secret">
            <Select
              items={keyItems}
              value={header.secretKey || undefined}
              onValueChange={value =>
                updateHeader(group.id, header.id, { secretKey: String(value) })
              }
              disabled={disabled || !header.secretName}>
              <SelectTrigger
                id={`mcp-${header.id}-secret-key`}
                className={cn(GHOST_TRIGGER, 'h-10 w-full min-w-0')}>
                <SelectValue placeholder="Select key" />
              </SelectTrigger>
              <SelectContent className="bg-fill-onsurface-ui-2">
                {keyItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          {secretMissing && (
            <span className="text-status-error col-span-2 inline-flex items-center gap-1 text-xs">
              <IconShell size="sm" className="text-status-error">
                <Warning />
              </IconShell>
              Secret &ldquo;{header.secretName}&rdquo; not found in this
              namespace
            </span>
          )}
        </>
      );
    }

    if (header.source === 'value') {
      const sensitive = isSensitiveHeaderName(header.name);
      return (
        <>
          <LabeledField
            id={`mcp-${header.id}-value`}
            label="Value"
            className="col-span-2">
            <div className={underlineClass}>
              <input
                id={`mcp-${header.id}-value`}
                type="text"
                value={header.value}
                onChange={event =>
                  updateHeader(group.id, header.id, {
                    value: event.target.value,
                  })
                }
                placeholder="Header value"
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </LabeledField>
          {sensitive && (
            <span className="text-status-warning col-span-2 inline-flex items-center gap-1 text-xs">
              <IconShell size="sm" className="text-status-warning">
                <Warning />
              </IconShell>
              Stored in plain text on the agent. Use a secret for credentials.
            </span>
          )}
        </>
      );
    }

    if (header.source === 'queryParameterRef') {
      return (
        <>
          <LabeledField
            id={`mcp-${header.id}-query-parameter`}
            label="Query parameter name"
            className="col-span-2">
            <div className={underlineClass}>
              <input
                id={`mcp-${header.id}-query-parameter`}
                type="text"
                value={header.queryParameterName}
                onChange={event =>
                  updateHeader(group.id, header.id, {
                    queryParameterName: event.target.value,
                  })
                }
                placeholder="parameter_name"
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </LabeledField>
          <span className="text-fg-tertiary col-span-2 text-xs">
            Value comes from a query parameter at run time.
          </span>
        </>
      );
    }

    return (
      <>
        <LabeledField id={`mcp-${header.id}-configmap-name`} label="ConfigMap">
          <div className={underlineClass}>
            <input
              id={`mcp-${header.id}-configmap-name`}
              type="text"
              value={header.configMapName}
              onChange={event =>
                updateHeader(group.id, header.id, {
                  configMapName: event.target.value,
                })
              }
              placeholder="ConfigMap name"
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </LabeledField>
        <LabeledField
          id={`mcp-${header.id}-configmap-key`}
          label="Key in ConfigMap">
          <div className={underlineClass}>
            <input
              id={`mcp-${header.id}-configmap-key`}
              type="text"
              value={header.configMapKey}
              onChange={event =>
                updateHeader(group.id, header.id, {
                  configMapKey: event.target.value,
                })
              }
              placeholder="Key"
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </LabeledField>
      </>
    );
  };

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
            <div key={header.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
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
                    suggestions={declaredNamesFor(header)}
                    disabled={disabled}
                    onChange={name =>
                      updateHeader(group.id, header.id, { name })
                    }
                    className="w-full"
                  />
                </div>

                <div className="flex min-w-0 flex-1 items-center">
                  {isAdvanced(header) ? (
                    <Select
                      items={SOURCE_ITEMS}
                      value={header.source}
                      onValueChange={value =>
                        updateHeader(group.id, header.id, {
                          source: String(value) as McpHeaderSource,
                        })
                      }
                      disabled={disabled}>
                      <SelectTrigger
                        id={`mcp-${header.id}-source`}
                        aria-label="Header override"
                        className={cn(GHOST_TRIGGER, 'h-10 w-full min-w-0')}>
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
                      onSelectAdvanced={() => revealAdvanced(header.id)}
                      className="w-full"
                    />
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

              {isAdvanced(header) && (
                <div className="grid grid-cols-2 items-start gap-3">
                  {renderValueFields(group, header)}
                </div>
              )}
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
