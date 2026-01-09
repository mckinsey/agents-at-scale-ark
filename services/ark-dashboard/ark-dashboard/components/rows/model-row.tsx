'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { DASHBOARD_SECTIONS } from '@/lib/constants/dashboard-icons';
import { getModelTypeDisplayName } from '@/lib/constants/model-types';
import type { Model } from '@/lib/services';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

interface ModelRowProps {
  model: Model;
  onDelete?: (id: string) => void;
}

export function ModelRow({ model, onDelete }: ModelRowProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get custom icon or default model icon
  const IconComponent = getCustomIcon(
    model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    DASHBOARD_SECTIONS.models.icon,
  );

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full items-center gap-4 rounded-md border px-4 py-3 transition-colors">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />

          <div className="flex max-w-[300px] min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={model.name}>
              {model.name}
            </p>
            <p
              className="text-muted-foreground truncate text-xs"
              title={`${getModelTypeDisplayName(model.type)} • ${model.provider} • ${model.model}`}>
              {getModelTypeDisplayName(model.type)} • {model.provider} •{' '}
              {model.model}
            </p>
          </div>
        </div>
        <div className="mr-4 flex-shrink-0">
          <AvailabilityStatusBadge
            status={model.available}
            eventsLink={`/events?kind=Model&name=${model.name}&page=1`}
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  asChild>
                  <Link href={`/models/${model.id}/update`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit model</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete model</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
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
