'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Edit, Trash } from '@/components/icons';
import { IconActionButton } from '@/components/ui/icon-action-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Model } from '@/lib/services/models';
import type { Secret } from '@/lib/services/secrets';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

interface SecretsTableProps {
  readonly secrets: readonly Secret[];
  readonly models: readonly Model[];
  readonly onEdit: (secret: Secret) => void;
  readonly onDelete: (id: string) => void;
}

const MAX_VISIBLE_MODELS = 3;

const COL = {
  name: 'w-[280px]',
  usedBy: 'w-[120px]',
  status: 'w-[140px]',
  action: 'w-[100px]',
};

const rowHoverOverlayClass =
  'pointer-events-none absolute inset-0 -z-10 transition-colors group-hover:bg-stateslayer-overlay-hover';

function modelUsesSecret(model: Model, secretName: string): boolean {
  const config = model.config;
  if (!config) {
    return false;
  }

  const checkValueSource = (valueSource: unknown): boolean => {
    if (!valueSource || typeof valueSource !== 'object') {
      return false;
    }
    const source = valueSource as Record<string, unknown>;
    const valueFrom = source.valueFrom as Record<string, unknown> | undefined;
    const secretKeyRef = valueFrom?.secretKeyRef as
      | Record<string, unknown>
      | undefined;
    return secretKeyRef?.name === secretName;
  };

  for (const [, providerConfig] of Object.entries(config)) {
    if (!providerConfig || typeof providerConfig !== 'object') {
      continue;
    }

    for (const [, value] of Object.entries(providerConfig)) {
      if (checkValueSource(value)) {
        return true;
      }
    }
  }

  return false;
}

function SecretStatus({ inUse }: Readonly<{ inUse: boolean }>) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'size-2 rounded-full',
          inUse ? 'bg-status-success' : 'bg-fg-tertiary',
        )}
      />
      <span className="label-regular-primary text-fg-primary">
        {inUse ? 'In use' : 'Not in use'}
      </span>
    </span>
  );
}

function ModelsInUse({ models }: Readonly<{ models: readonly Model[] }>) {
  if (models.length === 0) {
    return <span className="text-fg-secondary text-sm leading-5">-</span>;
  }

  const visible = models.slice(0, MAX_VISIBLE_MODELS);
  const overflow = models.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map(model => (
        <Tag
          key={model.id}
          variant="primary"
          size="sm"
          className="max-w-[180px] overflow-hidden"
          title={model.name}>
          <span className="truncate">{model.name}</span>
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
              {models.slice(MAX_VISIBLE_MODELS).map(model => (
                <span key={model.id}>{model.name}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

interface SecretTableRowProps {
  readonly secret: Secret;
  readonly models: readonly Model[];
  readonly onEdit: (secret: Secret) => void;
  readonly onDelete: (id: string) => void;
}

function SecretTableRow({
  secret,
  models,
  onEdit,
  onDelete,
}: Readonly<SecretTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const usingModels = models.filter(model =>
    modelUsesSecret(model, secret.name),
  );
  const usageCount = usingModels.length;
  const isInUse = usageCount > 0;

  return (
    <>
      <TableRow className="relative isolate transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <span className="text-fg-primary block truncate" title={secret.name}>
            {secret.name}
          </span>
        </TableCell>
        <TableCell size="small" className={COL.usedBy}>
          <span className="text-fg-secondary block truncate">
            {usageCount} model{usageCount === 1 ? '' : 's'}
          </span>
        </TableCell>
        <TableCell size="small">
          <ModelsInUse models={usingModels} />
        </TableCell>
        <TableCell size="small" className={COL.status}>
          <SecretStatus inUse={isInUse} />
        </TableCell>
        <TableCell size="small" className={COL.action}>
          <div className="flex items-center justify-center gap-2">
            <IconActionButton
              label="Edit secret"
              disabled={readOnlyMode}
              onClick={() => {
                if (!readOnlyMode) onEdit(secret);
              }}>
              <Edit />
            </IconActionButton>
            <IconActionButton
              label="Delete secret"
              disabled={isInUse || readOnlyMode}
              onClick={() => {
                if (!isInUse && !readOnlyMode) setDeleteConfirmOpen(true);
              }}>
              <Trash />
            </IconActionButton>
          </div>
        </TableCell>
      </TableRow>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Secret"
        description={`Do you want to delete "${secret.name}" secret? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(secret.id)}
        variant="destructive"
      />
    </>
  );
}

export function SecretsTable({
  secrets,
  models,
  onEdit,
  onDelete,
}: Readonly<SecretsTableProps>) {
  return (
    <Table
      aria-label="Secrets"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small" className={COL.usedBy}>
            Used by
          </TableHead>
          <TableHead size="small">Models in use</TableHead>
          <TableHead size="small" className={COL.status}>
            Status
          </TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {secrets.map(secret => (
          <SecretTableRow
            key={secret.id}
            secret={secret}
            models={models}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
