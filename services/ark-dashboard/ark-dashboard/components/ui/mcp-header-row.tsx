'use client';

import { useMemo } from 'react';

import { Add, Info, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
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
import {
  type SecretKeyOption,
  secretOptionValue,
} from '@/lib/hooks/use-secret-key-options';
import { cn } from '@/lib/utils';
import {
  ALL_MCP_SERVERS_LABEL,
  ALL_MCP_SERVERS_VALUE,
  type HeaderNamesForServer,
  type McpHeaderRow,
  type McpHeaderRowError,
  type McpHeaderSource,
  serverChangeUpdates,
} from '@/lib/utils/mcp-header-overrides';

const COLUMN_LABEL_CLASS = 'text-fg-secondary label-small-primary';

const FLIP_COLLISION = { side: 'flip', align: 'shift' } as const;

const SOURCE_ITEMS: { value: McpHeaderSource; label: string }[] = [
  { value: 'secret', label: 'Secret' },
  { value: 'value', label: 'Direct' },
];

interface GhostSelectItem {
  value: string;
  label: string;
}

interface GhostSelectProps {
  readonly id: string;
  readonly ariaLabel: string;
  readonly items: GhostSelectItem[];
  readonly value: string | null;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly invalid?: boolean;
  readonly onChange: (value: string) => void;
}

function GhostSelect({
  id,
  ariaLabel,
  items,
  value,
  placeholder,
  disabled,
  invalid,
  onChange,
}: GhostSelectProps) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={next => onChange(String(next ?? ''))}
      disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        className={cn(GHOST_TRIGGER, 'h-9 w-full min-w-0')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className="bg-fill-onsurface-ui-2"
        collisionAvoidance={FLIP_COLLISION}>
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>
            <SelectItemText>{item.label}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldError({ message }: { readonly message?: string }) {
  if (!message) return null;
  return <p className="text-status-error text-sm font-normal">{message}</p>;
}

export interface HeaderRowsHeadingProps {
  readonly title: string;
  readonly tooltip?: string;
  readonly count: number;
  readonly addLabel?: string;
  readonly disabled?: boolean;
  readonly onAdd: () => void;
}

export function HeaderRowsHeading({
  title,
  tooltip,
  count,
  addLabel = 'Add rule',
  disabled,
  onAdd,
}: HeaderRowsHeadingProps) {
  return (
    <div className="flex w-full items-start justify-between">
      <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-fg-secondary label-regular-primary">{title}</h3>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`About ${title.toLowerCase()}`}
                  className="text-fg-secondary cursor-help">
                  <Info className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-wrap">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-fg-secondary text-xs leading-4 tracking-[0.024px]">
          {count} header{count === 1 ? '' : 's'}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onAdd}
        disabled={disabled}>
        <Add className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

export function McpHeaderColumnLabels({
  showServer = true,
}: {
  readonly showServer?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {showServer && (
        <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
          MCP server
        </span>
      )}
      <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
        Header name
      </span>
      <span className={cn(COLUMN_LABEL_CLASS, 'w-28 shrink-0')}>Source</span>
      <span className={cn(COLUMN_LABEL_CLASS, 'min-w-0 flex-1')}>
        Header override
      </span>
      <span className="w-7 shrink-0" />
    </div>
  );
}

export interface McpHeaderRowFieldsProps {
  readonly row: McpHeaderRow;
  readonly showServer?: boolean;
  readonly serverNames?: string[];
  readonly nameOptions?: string[];
  readonly namesForServer?: HeaderNamesForServer;
  readonly secretOptions: SecretKeyOption[];
  readonly secretsLoaded: boolean;
  readonly error?: McpHeaderRowError;
  readonly disabled?: boolean;
  readonly namePlaceholder?: string;
  readonly valuePlaceholder?: string;
  readonly onChange: (updates: Partial<McpHeaderRow>) => void;
  readonly onRemove: () => void;
}

export function McpHeaderRowFields({
  row,
  showServer = true,
  serverNames = [],
  nameOptions,
  namesForServer,
  secretOptions,
  secretsLoaded,
  error,
  disabled,
  namePlaceholder = 'Header-Name',
  valuePlaceholder = 'Value',
  onChange,
  onRemove,
}: McpHeaderRowFieldsProps) {
  const serverItems = useMemo(() => {
    const names = new Set(serverNames);
    if (row.serverName) names.add(row.serverName);
    return [
      { value: ALL_MCP_SERVERS_VALUE, label: ALL_MCP_SERVERS_LABEL },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ value: name, label: name })),
    ];
  }, [serverNames, row.serverName]);

  const nameItems = useMemo(
    () => (nameOptions ?? []).map(name => ({ value: name, label: name })),
    [nameOptions],
  );

  const secretValue = secretOptionValue(row.secretName, row.secretKey);
  const isKnownSecret = secretOptions.some(
    option => option.value === secretValue,
  );
  const isMissingSecret =
    secretsLoaded && !!row.secretName && !!row.secretKey && !isKnownSecret;

  const handleServerChange = (selected: string) => {
    const serverName =
      !selected || selected === ALL_MCP_SERVERS_VALUE ? undefined : selected;
    onChange(
      namesForServer
        ? serverChangeUpdates(row, serverName, namesForServer(serverName))
        : { serverName },
    );
  };

  const handleSecretChange = (selected: string) => {
    const option = secretOptions.find(item => item.value === selected);
    if (option) {
      onChange({ secretName: option.secretName, secretKey: option.secretKey });
    }
  };

  return (
    <div className="flex items-start gap-3" data-testid="header-row">
      {showServer && (
        <div className="flex min-w-0 flex-1">
          <GhostSelect
            id={`mcp-${row.id}-server`}
            ariaLabel="MCP server"
            items={serverItems}
            value={row.serverName ?? ALL_MCP_SERVERS_VALUE}
            placeholder={ALL_MCP_SERVERS_LABEL}
            disabled={disabled}
            onChange={handleServerChange}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {nameOptions ? (
          <GhostSelect
            id={`mcp-${row.id}-name`}
            ariaLabel="Header name"
            items={nameItems}
            value={row.name || null}
            placeholder={
              nameItems.length === 0
                ? 'No headers to override'
                : 'Select a header'
            }
            disabled={disabled || nameItems.length === 0}
            invalid={!!error?.nameError}
            onChange={name => onChange({ name })}
          />
        ) : (
          <Input
            id={`mcp-${row.id}-name`}
            variant="inline"
            aria-label="Header name"
            aria-invalid={!!error?.nameError}
            value={row.name}
            onChange={event => onChange({ name: event.target.value })}
            placeholder={namePlaceholder}
            disabled={disabled}
            autoComplete="off"
            className="h-9 w-full min-w-0"
          />
        )}
        <FieldError message={error?.nameError} />
      </div>

      <div className="flex w-28 shrink-0">
        <GhostSelect
          id={`mcp-${row.id}-source`}
          ariaLabel="Header source"
          items={SOURCE_ITEMS}
          value={row.source}
          disabled={disabled}
          onChange={next =>
            onChange({
              source: next === 'value' ? 'value' : 'secret',
              value: '',
              secretName: '',
              secretKey: '',
            })
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {row.source === 'secret' ? (
          <>
            <GhostSelect
              id={`mcp-${row.id}-override`}
              ariaLabel="Header override"
              items={secretOptions}
              value={isKnownSecret ? secretValue : null}
              placeholder="Select a secret"
              disabled={disabled}
              invalid={!!error?.valueError}
              onChange={handleSecretChange}
            />
            {isMissingSecret && (
              <span className="text-status-error inline-flex items-center gap-1 text-xs">
                <IconShell size="sm" className="text-status-error">
                  <Warning />
                </IconShell>
                {row.secretName}/{row.secretKey} is not available in this
                namespace
              </span>
            )}
            {secretsLoaded && secretOptions.length === 0 && (
              <span className="text-fg-tertiary text-xs">
                No secrets in this namespace yet.
              </span>
            )}
          </>
        ) : (
          <Input
            id={`mcp-${row.id}-value`}
            variant="inline"
            aria-label="Header value"
            aria-invalid={!!error?.valueError}
            value={row.value}
            onChange={event => onChange({ value: event.target.value })}
            placeholder={valuePlaceholder}
            disabled={disabled}
            autoComplete="off"
            className="h-9 w-full min-w-0"
          />
        )}
        <FieldError message={error?.valueError} />
      </div>

      <div className="flex h-9 w-7 shrink-0 items-center justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove header">
          <IconShell size="sm" variant="secondary">
            <Trash />
          </IconShell>
        </Button>
      </div>
    </div>
  );
}
