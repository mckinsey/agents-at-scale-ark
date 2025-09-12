"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { DASHBOARD_SECTIONS } from "@/lib/constants/dashboard-icons";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ModelEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Model,
  Agent,
  ModelCreateRequest,
  ModelUpdateRequest
} from "@/lib/services";

interface ModelRowProps {
  model: Model;
  agents: Agent[];
  onUpdate?: (
    model: ModelCreateRequest | (ModelUpdateRequest & { id: string })
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function ModelRow({
  model,
  agents,
  onUpdate,
  onDelete,
  namespace
}: ModelRowProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Check if any agents are using this model
  const agentsUsingModel = agents.filter(
    (agent) => agent.modelRef?.name === model.name
  );
  const isActive = agentsUsingModel.length > 0;

  // Check if model has an error status
  const hasError = model.status === "error";

  // Get custom icon or default model icon
  const IconComponent = getCustomIcon(model.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], DASHBOARD_SECTIONS.models.icon);

  // Determine status and its styling
  const getStatusComponent = () => {
    let bgColor = "bg-gray-100";
    let textColor = "text-gray-800";
    let statusText = "Inactive";

    if (isActive && !hasError) {
      bgColor = "bg-green-100";
      textColor = "text-green-800";
      statusText = "Active";
    }

    if (hasError) {
      bgColor = "bg-red-100";
      textColor = "text-red-800";
      statusText = "Error";
    }

    return (
      <div
        className={`px-2 py-1 rounded-full text-xs font-medium ${bgColor} ${textColor}`}
      >
        {statusText}
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center py-3 px-4 bg-card border rounded-md shadow-sm hover:bg-accent/5 transition-colors w-full gap-4">
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

        <div className="text-sm text-muted-foreground flex-shrink-0 mr-4">
          {agentsUsingModel.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="text-left hover:underline cursor-help">
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
          {agentsUsingModel.length === 0 && <span>Not in use</span>}
        </div>

        <div className="flex-shrink-0 mr-4">{getStatusComponent()}</div>

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
                    className={cn(
                      "h-8 w-8 p-0",
                      isActive && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !isActive && setDeleteConfirmOpen(true)}
                    disabled={isActive}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isActive ? "Cannot delete model in use" : "Delete model"}
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