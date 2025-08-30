"use client";

import { Bot, MessageCircle, Pencil, Trash2 } from "lucide-react";
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
import { toggleFloatingChat } from "@/lib/chat-events";
import { useChatState } from "@/lib/chat-context";
import { useState } from "react";
import { AgentEditor } from "@/components/editors";
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Team,
  Model
} from "@/lib/services";

interface AgentRowProps {
  agent: Agent;
  teams: Team[];
  models: Model[];
  onUpdate?: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string }
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
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

  // Get the model name from the modelRef
  const modelName = agent.modelRef?.name || "No model assigned";

  // Check if this is an A2A agent
  const isA2A = agent.isA2A || false;

  // Get custom icon or default Bot icon
  const IconComponent = getCustomIcon(agent.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], Bot);

  return (
    <>
      <div className="flex items-center py-3 px-4 bg-card border rounded-md shadow-sm hover:bg-accent/5 transition-colors w-full gap-4 flex-wrap">
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
                    onClick={() => !isChatOpen && onDelete(agent.id)}
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
    </>
  );
}