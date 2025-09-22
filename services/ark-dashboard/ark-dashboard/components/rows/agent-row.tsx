"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { AvailabilityStatusBadge } from "@/components/ui/availability-status-badge";
import { useChatState } from "@/lib/chat-context";
import { toggleFloatingChat } from "@/lib/chat-events";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { AgentEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Model,
  Team
} from "@/lib/services";
import { cn } from "@/lib/utils";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { Bot, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

interface AgentRowProps {
  readonly   agent: Agent;
  readonly   teams: Team[];
  readonly   models: Model[];
  readonly   onUpdate?: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string }
  ) => void;
  readonly   onDelete?: (id: string) => void;
  readonly   namespace: string;
}

export function AgentRow({
  agent,
  teams,
  models,
  onUpdate,
  onDelete,
  namespace
}: AgentRowProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(agent.name);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get the model name from the modelRef
  const modelName = agent.modelRef?.name || "No model assigned";

  // Check if this is an A2A agent
  const isA2A = agent.isA2A || false;

  // Get custom icon or default Bot icon
  const IconComponent = getCustomIcon(
    agent.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Bot
  );

  return (
    <>
      <div className="flex items-center py-3 px-4 bg-card border rounded-md hover:bg-accent/5 transition-colors w-full gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-grow overflow-hidden">
          <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />

          <div className="flex flex-col gap-1 min-w-0 max-w-[400px]">
            <p className="font-medium text-sm truncate" title={agent.name}>
              {agent.name}
            </p>
            <p
              className="text-xs text-muted-foreground truncate"
              title={agent.description || ""}
            >
              {agent.description || "No description"}
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground flex-shrink-0 mr-4">
          {!isA2A && <span>Model: {modelName}</span>}
          {isA2A && <span>A2A Agent</span>}
        </div>

        <AvailabilityStatusBadge
          status={agent.available}
          eventsLink={`/events?namespace=${namespace}&kind=Agent&name=${agent.name}&page=1`}
        />

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
                <TooltipContent>Edit agent</TooltipContent>
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
                      isChatOpen && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !isChatOpen && setDeleteConfirmOpen(true)}
                    disabled={isChatOpen}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isChatOpen ? "Cannot delete agent in use" : "Delete agent"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 w-8 p-0", isChatOpen && "text-primary")}
                  onClick={() =>
                    toggleFloatingChat(agent.name, "agent", namespace)
                  }
                >
                  <MessageCircle
                    className={cn("h-4 w-4", isChatOpen && "fill-primary")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Chat with agent</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <AgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={agent}
        models={models}
        teams={teams}
        onSave={onUpdate || (() => {})}
        namespace={namespace}
      />
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Agent"
          description={`Do you want to delete "${agent.name}" agent? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(agent.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
