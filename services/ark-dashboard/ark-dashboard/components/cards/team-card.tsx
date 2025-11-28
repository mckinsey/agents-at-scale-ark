'use client';

import { MessageCircle, Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { TeamEditor } from '@/components/editors';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useChatState } from '@/lib/chat-context';
import { toggleFloatingChat } from '@/lib/chat-events';
import type {
  Agent,
  Team,
  TeamCreateRequest,
  TeamUpdateRequest,
} from '@/lib/services';

import { BaseCard, type BaseCardAction } from './base-card';

interface TeamCardProps {
  team: Team;
  agents: Agent[];
  onUpdate?: (
    team: (TeamCreateRequest | TeamUpdateRequest) & { id?: string },
  ) => void;
  onDelete?: (id: string) => void;
}

export function TeamCard({ team, agents, onUpdate, onDelete }: TeamCardProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(team.name);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get the names of member agents
  const memberAgents = team.members
    .filter(member => member.type === 'agent')
    .map(member => agents.find(agent => agent.name === member.name))
    .filter(Boolean) as Agent[];

  const memberNames = memberAgents.map(agent => agent.name).join(', ');

  const actions: BaseCardAction[] = [];

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: 'Edit team',
      onClick: () => setEditorOpen(true),
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete team',
      onClick: () => setDeleteConfirmOpen(true),
      disabled: isChatOpen,
    });
  }

  actions.push({
    icon: MessageCircle,
    label: 'Chat with team',
    onClick: () => toggleFloatingChat(team.name, 'team'),
    className: isChatOpen ? 'fill-current' : '',
  });

  return (
    <>
      <BaseCard
        title={team.name}
        description={team.description}
        icon={<Users className="h-5 w-5" />}
        actions={
          team.members.length === 0
            ? actions.filter(a => a.label !== 'Chat with team')
            : actions
        }
        footer={
          <div className="flex w-full flex-row items-end justify-between">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      {team.members.length} member
                      {team.members.length !== 1 ? 's' : ''}
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
            <AvailabilityStatusBadge
              status={team.available}
              eventsLink={`/events?kind=Team&name=${team.name}&page=1`}
            />
          </div>
        }
      />
      <TeamEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        team={team}
        agents={agents}
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
