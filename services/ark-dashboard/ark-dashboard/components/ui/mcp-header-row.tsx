'use client';

import { Add, Info, Trash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { HeaderNameField } from '@/components/ui/header-name-field';
import { HeaderNameSelect } from '@/components/ui/header-name-select';
import { HeaderOverrideSelect } from '@/components/ui/header-override-select';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { McpServerSelect } from '@/components/ui/mcp-server-select';
import {
  FLIP_COLLISION,
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
import type { SecretKeyOption } from '@/lib/hooks/use-secret-key-options';
import { cn } from '@/lib/utils';
import type {
  McpHeaderRow,
  McpHeaderRowError,
  McpHeaderSource,
} from '@/lib/utils/mcp-header-overrides';

export const COLUMN_LABEL_CLASS = 'text-fg-secondary label-small-primary';

const SOURCE_ITEMS: { value: McpHeaderSource; label: string }[] = [
  { value: 'secret', label: 'Secret' },
  { value: 'value', label: 'Direct' },
];

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
              <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
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
  readonly secretOptions: SecretKeyOption[];
  readonly secretsLoaded: boolean;
  readonly error?: McpHeaderRowError;
  readonly disabled?: boolean;
  readonly scopeLocked?: boolean;
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
  secretOptions,
  secretsLoaded,
  error,
  disabled,
  scopeLocked,
  namePlaceholder,
  valuePlaceholder = 'Value',
  onChange,
  onRemove,
}: McpHeaderRowFieldsProps) {
  return (
    <div className="flex items-start gap-3">
      {showServer && (
        <div className="flex min-w-0 flex-1">
          <McpServerSelect
            id={`mcp-${row.id}-server`}
            serverNames={serverNames}
            value={row.serverName}
            disabled={disabled || scopeLocked}
            onChange={serverName => onChange({ serverName })}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {nameOptions ? (
          <HeaderNameSelect
            id={`mcp-${row.id}-name`}
            value={row.name}
            options={nameOptions}
            disabled={disabled || scopeLocked}
            invalid={!!error?.nameError}
            onChange={name => onChange({ name })}
          />
        ) : (
          <HeaderNameField
            id={`mcp-${row.id}-name`}
            value={row.name}
            disabled={disabled || scopeLocked}
            invalid={!!error?.nameError}
            placeholder={namePlaceholder}
            onChange={name => onChange({ name })}
          />
        )}
        <FieldError message={error?.nameError} />
      </div>

      <div className="flex w-28 shrink-0">
        <Select
          items={SOURCE_ITEMS}
          value={row.source}
          onValueChange={next =>
            onChange({
              source: next === 'value' ? 'value' : 'secret',
              value: '',
              secretName: '',
              secretKey: '',
            })
          }
          disabled={disabled}>
          <SelectTrigger
            id={`mcp-${row.id}-source`}
            aria-label="Header source"
            className={cn(GHOST_TRIGGER, 'h-9 w-full min-w-0')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
        className="bg-fill-onsurface-ui-2"
        collisionAvoidance={FLIP_COLLISION}>
            {SOURCE_ITEMS.map(item => (
              <SelectItem key={item.value} value={item.value}>
                <SelectItemText>{item.label}</SelectItemText>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {row.source === 'secret' ? (
          <HeaderOverrideSelect
            id={`mcp-${row.id}-override`}
            options={secretOptions}
            loaded={secretsLoaded}
            secretName={row.secretName}
            secretKey={row.secretKey}
            disabled={disabled}
            invalid={!!error?.valueError}
            onSelectSecret={(secretName, secretKey) =>
              onChange({ secretName, secretKey })
            }
          />
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
        {!scopeLocked && (
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
        )}
      </div>
    </div>
  );
}
