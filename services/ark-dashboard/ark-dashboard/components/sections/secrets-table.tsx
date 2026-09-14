'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { LabelsCell, TagOverflowList } from '@/components/sections/labels-cell';
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
import type { Model } from '@/lib/services/models';
import type { Secret } from '@/lib/services/secrets';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

interface SecretsTableProps {
  readonly secrets: readonly Secret[];
  readonly models: readonly Model[];
  readonly onDelete: (id: string) => void;
}

const MAX_VISIBLE_MODELS = 3;

const COL = {
  name: 'w-[280px]',
  usedBy: 'w-[120px]',
  labels: 'w-[220px]',
  status: 'w-[140px]',
  action: 'w-[100px]',
};

function NameCell({ secret }: Readonly<{ secret: Secret }>) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <TruncatedTooltip label={secret.name}>
        <NamespacedLink
          href={`/secrets/${encodeURIComponent(secret.name)}`}
          className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
          {secret.name}
        </NamespacedLink>
      </TruncatedTooltip>
      {secret.alias && (
        <TruncatedTooltip label={secret.alias}>
          <span className="text-fg-secondary label-small-primary relative z-10 block truncate">
            Alias: {secret.alias}
          </span>
        </TruncatedTooltip>
      )}
    </div>
  );
}

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
  return (
    <TagOverflowList
      items={models}
      maxVisible={MAX_VISIBLE_MODELS}
      getKey={model => model.id}
      getLabel={model => model.name}
      tagClassName="max-w-[180px] overflow-hidden"
    />
  );
}

interface SecretTableRowProps {
  readonly secret: Secret;
  readonly models: readonly Model[];
  readonly onDelete: (id: string) => void;
}

function SecretTableRow({
  secret,
  models,
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
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small" className={COL.name}>
          <span aria-hidden className={rowHoverOverlayClass} />
          <NameCell secret={secret} />
        </TableCell>
        <TableCell size="small" className={COL.usedBy}>
          <span className="text-fg-secondary block truncate">
            {usageCount} model{usageCount === 1 ? '' : 's'}
          </span>
        </TableCell>
        <TableCell size="small">
          <ModelsInUse models={usingModels} />
        </TableCell>
        <TableCell size="small" className={cn(COL.labels, 'relative z-10')}>
          <LabelsCell labels={secret.labels} />
        </TableCell>
        <TableCell size="small" className={COL.status}>
          <SecretStatus inUse={isInUse} />
        </TableCell>
        <TableCell size="small" className={cn(COL.action, 'relative z-10')}>
          <div className="flex items-center justify-center gap-2">
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
  onDelete,
}: Readonly<SecretsTableProps>) {
  return (
    <Table
      aria-label="Secrets"
      className="min-w-[1136px] table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small" className={COL.usedBy}>
            Used by
          </TableHead>
          <TableHead size="small">Models in use</TableHead>
          <TableHead size="small" className={COL.labels}>
            Labels
          </TableHead>
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
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
