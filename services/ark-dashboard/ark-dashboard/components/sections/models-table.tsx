'use client';

import { type ComponentType, useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Anthropic, Azure, Bedrock, OpenAI, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { DASHBOARD_SECTIONS } from '@/lib/constants/dashboard-icons';
import { getModelProviderDisplayName } from '@/lib/constants/model-types';
import type { Model } from '@/lib/services';
import { cn } from '@/lib/utils';
import { getCustomIcon } from '@/lib/utils/icon-resolver';
import { useNamespace } from '@/providers/NamespaceProvider';

interface ModelsTableProps {
  readonly models: readonly Model[];
  readonly onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: { label: 'Unknown', dotClass: 'bg-fg-tertiary' },
} as const;

const PROVIDER_ICONS: Partial<
  Record<Model['provider'], ComponentType<{ className?: string }>>
> = {
  openai: OpenAI,
  azure: Azure,
  bedrock: Bedrock,
  anthropic: Anthropic,
};

const COL = {
  name: 'w-[260px] shrink-0',
  model: 'flex-1 min-w-0',
  provider: 'w-[200px] shrink-0',
  status: 'w-[120px] shrink-0',
  action: 'w-[72px] shrink-0',
};

const headerCellClass =
  'text-fg-secondary flex h-12 items-end px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass = 'flex h-[60px] items-center px-3';

function ModelStatus({ status }: { status?: Model['available'] | null }) {
  const value = status ?? 'Unknown';
  const config = STATUS_CONFIG[value];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2 rounded-full', config.dotClass)} />
      <span className="label-regular-primary text-fg-primary">
        {config.label}
      </span>
    </span>
  );
}

interface ModelTableRowProps {
  readonly model: Model;
  readonly onDelete: (id: string) => void;
}

function ModelTableRow({ model, onDelete }: ModelTableRowProps) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const customIcon = model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON];
  const CustomImg = customIcon ? getCustomIcon(customIcon) : null;
  const ProviderIcon =
    PROVIDER_ICONS[model.provider] ?? DASHBOARD_SECTIONS.models.icon;

  return (
    <>
      <div
        role="row"
        className="hover:bg-stateslayer-overlay-hover border-stroke-tertiary relative flex cursor-pointer items-center border-b transition-colors">
        <div role="cell" className={cn(rowCellClass, COL.name, 'gap-2')}>
          {CustomImg ? (
            <CustomImg className="size-4 shrink-0 object-contain" />
          ) : (
            <IconShell size="sm" variant="secondary">
              <ProviderIcon className="size-4" />
            </IconShell>
          )}
          <NamespacedLink
            href={`/models/${encodeURIComponent(model.id)}/update`}
            title={model.name}
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px] after:absolute after:inset-0 after:content-['']">
            {model.name}
          </NamespacedLink>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.model)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={model.model}>
            {model.model}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.provider)}>
          <span
            className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]"
            title={getModelProviderDisplayName(model.provider)}>
            {getModelProviderDisplayName(model.provider)}
          </span>
        </div>
        <div role="cell" className={cn(rowCellClass, COL.status)}>
          <ModelStatus status={model.available} />
        </div>
        <div
          role="cell"
          className={cn(
            rowCellClass,
            COL.action,
            'relative z-10 justify-center',
          )}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete model"
            disabled={readOnlyMode}
            onClick={() => {
              if (!readOnlyMode) setDeleteConfirmOpen(true);
            }}>
            <IconShell size="sm" variant="secondary">
              <Trash />
            </IconShell>
          </Button>
        </div>
      </div>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Model"
        description={`Do you want to delete "${model.name}" model? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(model.id)}
        variant="destructive"
      />
    </>
  );
}

export function ModelsTable({ models, onDelete }: ModelsTableProps) {
  return (
    <div role="table" aria-label="Models" className="flex w-full flex-col">
      <div
        role="row"
        className="border-stroke-tertiary flex items-center border-b">
        <div role="columnheader" className={cn(headerCellClass, COL.name)}>
          Name
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.model)}>
          Model
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.provider)}>
          Provider
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.status)}>
          Status
        </div>
        <div role="columnheader" className={cn(headerCellClass, COL.action)}>
          <span className="sr-only">Action</span>
        </div>
      </div>
      <div role="rowgroup" className="flex flex-col">
        {models.map(model => (
          <ModelTableRow key={model.id} model={model} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
