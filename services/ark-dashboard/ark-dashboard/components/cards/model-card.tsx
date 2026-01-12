'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { DASHBOARD_SECTIONS } from '@/lib/constants/dashboard-icons';
import { getModelTypeDisplayName } from '@/lib/constants/model-types';
import type { Model } from '@/lib/services';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import { BaseCard, type BaseCardAction } from './base-card';

interface ModelCardProps {
  model: Model;
  onDelete?: (id: string) => void;
}

export function ModelCard({ model, onDelete }: ModelCardProps) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Get custom icon or default model icon
  const IconComponent = getCustomIcon(
    model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    DASHBOARD_SECTIONS.models.icon,
  );

  const actions: BaseCardAction[] = [
    {
      icon: Pencil,
      label: 'Edit model',
      onClick: () => {
        router.push(`/models/${model.id}/update`);
      },
      disabled: false,
    },
  ];

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete model',
      onClick: () => setDeleteConfirmOpen(true),
      disabled: false,
    });
  }

  const description = (
    <span className="text-sm">
      {getModelTypeDisplayName(model.type)} • {model.provider} • {model.model}
    </span>
  );

  return (
    <>
      <BaseCard
        title={model.name}
        icon={<IconComponent className="h-5 w-5" />}
        actions={actions}
        footer={
          <div className="flex w-full flex-row items-end justify-between">
            <div className="w-full">{description}</div>
            <AvailabilityStatusBadge
              status={model.available}
              eventsLink={`/events?kind=Model&name=${model.name}&page=1`}
            />
          </div>
        }
      />
      {onDelete && (
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
      )}
    </>
  );
}
