"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { DASHBOARD_SECTIONS } from "@/lib/constants/dashboard-icons";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { BaseCard, type BaseCardAction } from "./base-card";
import { ModelEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Model,
  Agent,
  ModelCreateRequest,
  ModelUpdateRequest
} from "@/lib/services";

interface ModelCardProps {
  model: Model;
  agents: Agent[];
  onUpdate?: (
    model: ModelCreateRequest | (ModelUpdateRequest & { id: string })
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function ModelCard({
  model,
  agents,
  onUpdate,
  onDelete,
  namespace
}: ModelCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Check if any agents are using this model
  const agentsUsingModel = agents.filter(
    (agent) => agent.modelRef?.name === model.name
  );
  const isActive = agentsUsingModel.length > 0;

  // Check if model has an error status
  const hasError = model.status?.toLowerCase() === "error";

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
      disabled: isActive
    });
  }

  const description = (
    <>
      <span className="text-sm">
        {model.type} • {model.model}
      </span>
      {agentsUsingModel.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="text-left block mt-1 text-xs text-muted-foreground hover:underline cursor-help">
              <span>
                Used by {agentsUsingModel.length} agent
                {agentsUsingModel.length !== 1 ? "s" : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md p-2">
              <div className="max-h-60 overflow-y-auto">
                {agentsUsingModel.map((agent, index) => (
                  <div
                    key={agent.id}
                    className={`py-1 px-2 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-100"
                    }`}
                  >
                    {agent.name}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
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
            <div
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                hasError
                  ? "bg-red-100 text-red-800"
                  : isActive
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {hasError ? "Error" : isActive ? "Active" : "Inactive"}
            </div>
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
