"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { AvailabilityStatusBadge } from "@/components/ui/availability-status-badge";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { DASHBOARD_SECTIONS } from "@/lib/constants/dashboard-icons";
import { ModelEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Model,
  ModelCreateRequest,
  ModelUpdateRequest
} from "@/lib/services";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

interface ModelRowProps {
  model: Model;
  onUpdate?: (
    model: ModelCreateRequest | (ModelUpdateRequest & { id: string })
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function ModelRow({
  model,
  onUpdate,
  onDelete,
  namespace
}: ModelRowProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get custom icon or default model icon
  const IconComponent = getCustomIcon(
    model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    DASHBOARD_SECTIONS.models.icon
  );


  return (
    <>
      <div className="flex items-center py-3 px-4 bg-card border rounded-md hover:bg-accent/5 transition-colors w-full gap-4">
        <div className="flex items-center gap-3 flex-grow overflow-hidden">
          <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />

          <div className="flex flex-col gap-1 min-w-0 max-w-[300px]">
            <p className="font-medium text-sm truncate" title={model.name}>
              {model.name}
            </p>
            <p
              className="text-xs text-muted-foreground truncate"
              title={`${model.type} • ${model.model}`}
            >
              {model.type} • {model.model}
            </p>
          </div>
        </div>


        <div className="flex-shrink-0 mr-4">
          <AvailabilityStatusBadge
            status={model.available}
            eventsLink={`/events?namespace=${namespace}&kind=Model&name=${model.name}&page=1`}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {onUpdate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setEditorOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit model</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Delete model
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <ModelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        model={model}
        onSave={onUpdate || (() => {})}
        namespace={namespace}
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
