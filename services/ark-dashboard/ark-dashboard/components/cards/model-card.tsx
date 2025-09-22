"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { DASHBOARD_SECTIONS } from "@/lib/constants/dashboard-icons";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { BaseCard, type BaseCardAction } from "./base-card";
import { AvailabilityStatusBadge } from "@/components/ui/availability-status-badge";
import { ModelEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Model,
  ModelCreateRequest,
  ModelUpdateRequest
} from "@/lib/services";

interface ModelCardProps {
  model: Model;
  onUpdate?: (
    model: ModelCreateRequest | (ModelUpdateRequest & { id: string })
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function ModelCard({
  model,
  onUpdate,
  onDelete,
  namespace
}: ModelCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);


  // Get custom icon or default model icon
  const IconComponent = getCustomIcon(model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], DASHBOARD_SECTIONS.models.icon);

  const actions: BaseCardAction[] = [];

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: "Edit model",
      onClick: () => setEditorOpen(true),
      disabled: false
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: "Delete model",
      onClick: () => setDeleteConfirmOpen(true),
      disabled: false
    });
  }

  const description = (
    <span className="text-sm">
      {model.type} • {model.model}
    </span>
  );

  return (
    <>
      <BaseCard
        title={model.name}
        icon={<IconComponent className="h-5 w-5" />}
        actions={actions}
        footer={
          <div className="flex flex-row items-end w-full justify-between">
            <div className="w-full">{description}</div>
            <AvailabilityStatusBadge
              status={model.available}
              eventsLink={`/events?namespace=${namespace}&kind=Model&name=${model.name}&page=1`}
            />
          </div>
        }
      />
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
