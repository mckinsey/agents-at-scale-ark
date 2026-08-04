'use client';

import { type ComponentType, useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import {
  Azure,
  Bedrock,
  Claude,
  Gemini,
  Meta,
  OpenAI,
  Trash,
} from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
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
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { DASHBOARD_SECTIONS } from '@/lib/constants/dashboard-icons';
import { getModelProviderDisplayName } from '@/lib/constants/model-types';
import type { ModelListItem } from '@/lib/services/models';
import { cn } from '@/lib/utils';
import { getCustomIcon } from '@/lib/utils/icon-resolver';
import { useNamespace } from '@/providers/NamespaceProvider';

import { OriginCell, OriginColumnHeader } from './origin-column';

interface ModelsTableProps {
  readonly models: readonly ModelListItem[];
  readonly onDelete: (id: string) => void;
}

const STATUS_CONFIG = {
  True: { label: 'Active', dotClass: 'bg-status-success' },
  False: { label: 'Error', dotClass: 'bg-status-error' },
  Unknown: { label: 'Unknown', dotClass: 'bg-fg-tertiary' },
} as const;

const PROVIDER_ICONS: Record<
  string,
  { icon: ComponentType<{ className?: string }>; colorClass: string }
> = {
  openai: { icon: OpenAI, colorClass: 'text-white' },
  anthropic: { icon: Claude, colorClass: 'text-[#f87171]' },
  google: { icon: Gemini, colorClass: 'text-[#3b82f6]' },
  meta: { icon: Meta, colorClass: '' },
  azure: { icon: Azure, colorClass: 'text-[#0078d4]' },
  bedrock: { icon: Bedrock, colorClass: 'text-[#ff9900]' },
};

const DEFAULT_PROVIDER_ICON = {
  icon: DASHBOARD_SECTIONS.models.icon,
  colorClass: '',
};

const COL = {
  name: 'w-[260px]',
  provider: 'w-[200px]',
  status: 'w-[120px]',
  action: 'w-[72px]',
};

function ModelStatus({
  status,
}: Readonly<{ status?: ModelListItem['available'] | null }>) {
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
  readonly model: ModelListItem;
  readonly onDelete: (id: string) => void;
}

function ModelTableRow({ model, onDelete }: Readonly<ModelTableRowProps>) {
  const { readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const customIcon = model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON];
  const CustomImg = customIcon ? getCustomIcon(customIcon) : null;
  const { icon: ProviderIcon, colorClass } =
    PROVIDER_ICONS[model.provider] ?? DEFAULT_PROVIDER_ICON;

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small">
          <span aria-hidden className={rowHoverOverlayClass} />
          <div className="flex items-center gap-2">
            {CustomImg ? (
              <CustomImg className="size-4 shrink-0 object-contain" />
            ) : (
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center',
                  colorClass,
                )}>
                <ProviderIcon className="size-4" />
              </span>
            )}
            <NamespacedLink
              href={`/models/${encodeURIComponent(model.id)}/update`}
              title={model.name}
              className="text-fg-primary block truncate after:absolute after:inset-0 after:content-['']">
              {model.name}
            </NamespacedLink>
          </div>
        </TableCell>
        <OriginCell origin={model.annotations?.[ARK_ANNOTATIONS.ORIGIN]} />
        <TableCell size="small">
          <span className="text-fg-primary block truncate" title={model.model}>
            {model.model}
          </span>
        </TableCell>
        <TableCell size="small" className={COL.provider}>
          <span
            className="text-fg-primary block truncate"
            title={getModelProviderDisplayName(model.provider)}>
            {getModelProviderDisplayName(model.provider)}
          </span>
        </TableCell>
        <TableCell size="small">
          <ModelStatus status={model.available} />
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <div className="flex items-center justify-center">
            <IconActionButton
              label="Delete model"
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

export function ModelsTable({ models, onDelete }: Readonly<ModelsTableProps>) {
  return (
    <Table
      aria-label="Models"
      className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <OriginColumnHeader tooltip="Where the model was first created" />
          <TableHead size="small">Model</TableHead>
          <TableHead size="small" className={COL.provider}>
            Provider
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
        {models.map(model => (
          <ModelTableRow key={model.id} model={model} onDelete={onDelete} />
        ))}
      </TableBody>
    </Table>
  );
}
