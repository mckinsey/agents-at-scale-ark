'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Edit, Trash } from '@/components/icons';
import { AliasedNameCell } from '@/components/sections/aliased-name-cell';
import { ConfigurationValueCell } from '@/components/sections/configuration-value-cell';
import { LabelTags } from '@/components/sections/label-tags';
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
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import type { ConfigurationDetailResponse } from '@/lib/services/configurations';
import { useNamespace } from '@/providers/NamespaceProvider';

interface ConfigurationsTableProps {
  readonly configurations: readonly ConfigurationDetailResponse[];
  readonly onEdit: (configuration: ConfigurationDetailResponse) => void;
  readonly onDelete: (id: string) => void;
}

const DESCRIPTION_TOOLTIP_CLASS = 'max-w-[320px] text-left';

const COL = {
  name: 'w-[260px]',
  value: 'w-[240px]',
  labels: 'w-[220px]',
  action: 'w-[100px]',
};

interface ConfigurationTableRowProps {
  readonly configuration: ConfigurationDetailResponse;
  readonly readOnlyMode: boolean;
  readonly onEdit: (configuration: ConfigurationDetailResponse) => void;
  readonly onDelete: (id: string) => void;
}

function ConfigurationTableRow({
  configuration,
  readOnlyMode,
  onEdit,
  onDelete,
}: Readonly<ConfigurationTableRowProps>) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const description = configuration.description?.trim();

  return (
    <>
      <TableRow className="relative isolate transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <AliasedNameCell resource={configuration} />
        </TableCell>
        <TableCell size="small">
          {description ? (
            <TruncatedTooltip
              label={description}
              contentClassName={DESCRIPTION_TOOLTIP_CLASS}>
              <span className="text-fg-secondary block truncate">
                {description}
              </span>
            </TruncatedTooltip>
          ) : (
            <span className="text-fg-secondary block">-</span>
          )}
        </TableCell>
        <TableCell size="small" className={COL.value}>
          <ConfigurationValueCell configuration={configuration} />
        </TableCell>
        <TableCell size="small" className={COL.labels}>
          <LabelTags labels={configuration.labels ?? []} />
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
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Configuration"
        description={`Do you want to delete "${configuration.name}" configuration? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(configuration.id)}
        variant="destructive"
      />
    </>
  );
}

export function ConfigurationsTable({
  configurations,
  onEdit,
  onDelete,
}: Readonly<ConfigurationsTableProps>) {
  const { readOnlyMode } = useNamespace();

  return (
    <Table
      aria-label="Configurations"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.value}>
            Value
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
            readOnlyMode={readOnlyMode}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
