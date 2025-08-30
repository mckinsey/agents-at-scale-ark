"use client";

import { useState } from "react";
import { Bot, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { BaseCard, type BaseCardAction } from "./base-card";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { toggleFloatingChat } from "@/lib/chat-events";
import { useChatState } from "@/lib/chat-context";
import { AgentEditor } from "@/components/editors";
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Team,
  Model
} from "@/lib/services";

interface AgentCardProps {
  agent: Agent;
  teams: Team[];
  models: Model[];
  onUpdate?: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string }
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function AgentCard({
  agent,
  teams,
  models,
  onUpdate,
  onDelete,
  namespace
}: AgentCardProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(agent.name);
  const [editorOpen, setEditorOpen] = useState(false);

  // Get the model name from the modelRef
  const modelName = agent.modelRef?.name || "No model assigned";

  // Check if this is an A2A agent
  const isA2A = agent.isA2A || false;

  // Get custom icon or default Bot icon
  const IconComponent = getCustomIcon(agent.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], Bot);

  const actions: BaseCardAction[] = [];

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: "Edit agent",
      onClick: () => setEditorOpen(true)
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: "Delete agent",
      onClick: () => onDelete(agent.id),
      disabled: isChatOpen
    });
  }

  actions.push({
    icon: MessageCircle,
    label: "Chat with agent",
    onClick: () => toggleFloatingChat(agent.name, "agent", namespace),
    className: isChatOpen ? "fill-current" : ""
  });

  return (
    <>
      <BaseCard
        title={agent.name}
        description={agent.description}
        icon={<IconComponent className="h-5 w-5" />}
        actions={actions}
        footer={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            {!isA2A && <span>Model: {modelName}</span>}
            {isA2A && <span>A2A Agent</span>}
          </div>
        }
      />
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
