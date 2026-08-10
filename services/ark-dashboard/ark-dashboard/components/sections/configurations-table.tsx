'use client';

import { useState } from 'react';

import { Edit, Trash } from '@/components/icons';
import { ConfigurationDeleteDialog } from '@/components/sections/configuration-delete-dialog';
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
import { Tag } from '@/components/ui/tag';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Configuration } from '@/lib/services/configurations';
import { useNamespace } from '@/providers/NamespaceProvider';

interface ConfigurationsTableProps {
  readonly configurations: readonly Configuration[];
  readonly onEdit: (configuration: Configuration) => void;
  readonly onDelete: (name: string) => void;
}

const MAX_VISIBLE_LABELS = 3;

const TOOLTIP_MAX_CHARACTERS = 600;
const TOOLTIP_MAX_LINES = 12;

function clampForTooltip(value: string): string {
  const clamped =
    value.length > TOOLTIP_MAX_CHARACTERS
      ? `${value.slice(0, TOOLTIP_MAX_CHARACTERS)}…`
      : value;

  const lines = clamped.split('\n');
  if (lines.length <= TOOLTIP_MAX_LINES) {
    return clamped;
  }

  return `${lines.slice(0, TOOLTIP_MAX_LINES).join('\n')}\n…`;
}

const COL = {
  name: 'w-[280px]',
  description: 'w-[240px]',
  labels: 'w-[220px]',
  action: 'w-[100px]',
};

function NameCell({ configuration }: Readonly<{ configuration: Configuration }>) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <TruncatedTooltip label={configuration.name}>
        <span className="text-fg-primary block truncate">
          {configuration.name}
        </span>
      </TruncatedTooltip>
      {configuration.alias && (
        <TruncatedTooltip label={configuration.alias}>
          <span className="text-fg-secondary block truncate text-xs">
            Alias: {configuration.alias}
          </span>
        </TruncatedTooltip>
      )}
    </div>
  );
}

function ValueCell({ value }: Readonly<{ value: string }>) {
  const trimmed = value.trim();

  if (!trimmed) {
    return <span className="text-fg-secondary block">-</span>;
  }

  return (
    <TruncatedTooltip
      label={clampForTooltip(trimmed)}
      contentClassName="max-w-[360px] text-left font-mono break-all whitespace-pre-wrap">
      <span className="text-fg-secondary block truncate font-mono">
        {trimmed.replace(/\s+/g, ' ')}
      </span>
    </TruncatedTooltip>
  );
}

function LabelsCell({ labels }: Readonly<{ labels: readonly string[] }>) {
  if (labels.length === 0) {
    return <span className="text-fg-secondary text-sm leading-5">-</span>;
  }

  const visible = labels.slice(0, MAX_VISIBLE_LABELS);
  const overflow = labels.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map(label => (
        <Tag
          key={label}
          variant="primary"
          size="sm"
          className="max-w-[120px] overflow-hidden"
          title={label}>
          <span className="truncate">{label}</span>
        </Tag>
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Tag variant="primary" size="sm" className="shrink-0">
              +{overflow}
            </Tag>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1">
              {labels.slice(MAX_VISIBLE_LABELS).map(label => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface ConfigurationTableRowProps {
  readonly configuration: Configuration;
  readonly onEdit: (configuration: Configuration) => void;
  readonly onDelete: (name: string) => void;
}

function ConfigurationTableRow({
  configuration,
  onEdit,
  onDelete,
}: Readonly<ConfigurationTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <TableRow className="relative isolate transition-colors">
        <TableCell size="small" className={COL.name}>
          <span aria-hidden className={rowHoverOverlayClass} />
          <NameCell configuration={configuration} />
        </TableCell>
        <TableCell size="small">
          <ValueCell value={configuration.value ?? ''} />
        </TableCell>
        <TableCell size="small" className={COL.description}>
          <TruncatedTooltip label={configuration.description ?? ''}>
            <span className="text-fg-secondary block truncate">
              {configuration.description || '-'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={COL.labels}>
          <LabelsCell labels={configuration.labels} />
        </TableCell>
        <TableCell size="small" className={COL.action}>
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="Edit configuration"
              disabled={readOnlyMode}
              onClick={() => {
                if (!readOnlyMode) onEdit(configuration);
              }}>
              <Edit />
            </IconActionButton>
            <IconActionButton
              label="Delete configuration"
              disabled={readOnlyMode}
              onClick={() => {
                if (!readOnlyMode) setDeleteConfirmOpen(true);
              }}>
              <Trash />
            </IconActionButton>
          </div>
        </TableCell>
      </TableRow>
      <ConfigurationDeleteDialog
        name={configuration.name}
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={() => onDelete(configuration.name)}
      />
    </>
  );
}

export function ConfigurationsTable({
  configurations,
  onEdit,
  onDelete,
}: Readonly<ConfigurationsTableProps>) {
  return (
    <Table
      aria-label="Configurations"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Value</TableHead>
          <TableHead size="small" className={COL.description}>
            Description
          </TableHead>
          <TableHead size="small" className={COL.labels}>
            Labels
          </TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {configurations.map(configuration => (
          <ConfigurationTableRow
            key={configuration.id}
            configuration={configuration}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
