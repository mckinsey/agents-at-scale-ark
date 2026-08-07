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

const MAX_VISIBLE_TAGS = 3;

const COL = {
  name: 'w-[280px]',
  description: 'w-[240px]',
  tags: 'w-[220px]',
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

function TagsCell({ tags }: Readonly<{ tags: readonly string[] }>) {
  if (tags.length === 0) {
    return <span className="text-fg-secondary text-sm leading-5">-</span>;
  }

  const visible = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflow = tags.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map(tag => (
        <Tag
          key={tag}
          variant="primary"
          size="sm"
          className="max-w-[120px] overflow-hidden"
          title={tag}>
          <span className="truncate">{tag}</span>
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
              {tags.slice(MAX_VISIBLE_TAGS).map(tag => (
                <span key={tag}>{tag}</span>
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
          <TruncatedTooltip
            label={configuration.value ?? ''}
            contentClassName="max-w-96 whitespace-pre-wrap">
            <span className="text-fg-secondary block truncate">
              {configuration.value || '-'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={COL.description}>
          <TruncatedTooltip label={configuration.description ?? ''}>
            <span className="text-fg-secondary block truncate">
              {configuration.description || '-'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={COL.tags}>
          <TagsCell tags={configuration.tags} />
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
          <TableHead size="small" className={COL.tags}>
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
