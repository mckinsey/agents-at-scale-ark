'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Edit, MoreVert, Trash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconShell } from '@/components/ui/icon-shell';
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
  name: 'w-[280px] shrink-0',
  usedBy: 'w-[120px] shrink-0',
  models: 'flex-1 min-w-0',
  status: 'w-[140px] shrink-0',
  action: 'w-[72px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

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

function SecretStatus({ inUse }: { inUse: boolean }) {
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

function ModelsInUse({ models }: { models: readonly Model[] }) {
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
}: SecretTableRowProps) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const usingModels = models.filter(model =>
    modelUsesSecret(model, secret.name),
  );
  const usageCount = usingModels.length;
  const isInUse = usageCount > 0;

  return (
    <>
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover relative flex items-center gap-x-4 transition-colors">
        <div role="cell" className={cn(rowCellClass, COL.name)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={secret.name}>
            {secret.name}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.usedBy)}>
          <span className="text-fg-secondary block truncate text-sm leading-5 tracking-[-0.112px]">
            {usageCount} model{usageCount === 1 ? '' : 's'}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.models)}>
          <ModelsInUse models={usingModels} />
        </div>
        <div role="cell" className={cn(rowCellClass, COL.status)}>
          <SecretStatus inUse={isInUse} />
        </div>
        <div
          role="cell"
          className={cn(rowCellClass, COL.action, 'justify-center')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Secret actions"
                disabled={readOnlyMode}>
                <IconShell size="sm" variant="secondary">
                  <MoreVert />
                </IconShell>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(secret)}>
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Edit />
                </span>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isInUse}
                onSelect={() => setDeleteConfirmOpen(true)}>
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Trash />
                </span>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
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
}: SecretsTableProps) {
  return (
    <div role="table" aria-label="Secrets" className="flex w-full flex-col">
      <div role="row" className="flex items-center gap-x-4">
        <div role="columnheader" className={cn(headerCellClass, COL.name)}>
          Name
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.usedBy)}>
          Used by
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.models)}>
          Models in use
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.status)}>
          Status
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {secrets.map(secret => (
          <SecretTableRow
            key={secret.id}
            secret={secret}
            models={models}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
