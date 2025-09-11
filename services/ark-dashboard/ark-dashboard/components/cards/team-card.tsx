"use client";

import { useState } from "react";
import { MessageCircle, Pencil, Trash2, Users } from "lucide-react";
import { BaseCard, type BaseCardAction } from "./base-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { toggleFloatingChat } from "@/lib/chat-events";
import { useChatState } from "@/lib/chat-context";
import { TeamEditor } from "@/components/editors";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type {
  Team,
  TeamCreateRequest,
  TeamUpdateRequest,
  Agent,
  Model
} from "@/lib/services";

interface TeamCardProps {
  team: Team;
  agents: Agent[];
  models: Model[];
  onUpdate?: (
    team: (TeamCreateRequest | TeamUpdateRequest) & { id?: string }
  ) => void;
  onDelete?: (id: string) => void;
  namespace: string;
}

export function TeamCard({
  team,
  agents,
  models,
  onUpdate,
  onDelete,
  namespace
}: TeamCardProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(team.name);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get the names of member agents
  const memberAgents = team.members
    .filter((member) => member.type === "agent")
    .map((member) => agents.find((agent) => agent.name === member.name))
    .filter(Boolean) as Agent[];

  const memberNames = memberAgents.map((agent) => agent.name).join(", ");

  const actions: BaseCardAction[] = [];

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: "Edit team",
      onClick: () => setEditorOpen(true)
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: "Delete team",
      onClick: () => setDeleteConfirmOpen(true),
      disabled: isChatOpen
    });
  }

  actions.push({
    icon: MessageCircle,
    label: "Chat with team",
    onClick: () => toggleFloatingChat(team.name, "team", namespace),
    className: isChatOpen ? "fill-current" : ""
  });

  return (
    <>
      <BaseCard
        title={team.name}
        description={team.description}
        icon={<Users className="h-5 w-5" />}
        actions={
          team.members.length === 0
            ? actions.filter((a) => a.label !== "Chat with team")
            : actions
        }
        footer={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    {team.members.length} member
                    {team.members.length !== 1 ? "s" : ""}
                  </span>
                </TooltipTrigger>
                {team.members.length > 0 && (
                  <TooltipContent>
                    <p>{memberNames}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      />
      <TeamEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        team={team}
        agents={agents}
        models={models}
        onSave={onUpdate || (() => {})}
      />
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Team"
          description={`Do you want to delete "${team.name}" team? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(team.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
