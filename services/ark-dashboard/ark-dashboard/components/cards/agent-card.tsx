'use client';

import { Bot, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AgentEditor } from '@/components/editors';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { useChatState } from '@/lib/chat-context';
import { toggleFloatingChat } from '@/lib/chat-events';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type {
  Agent,
  AgentCreateRequest,
  AgentUpdateRequest,
  Model,
  Team,
} from '@/lib/services';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import { BaseCard, type BaseCardAction } from './base-card';

interface AgentCardProps {
  agent: Agent;
  teams: Team[];
  models: Model[];
  onUpdate?: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string },
  ) => void;
  onDelete?: (id: string) => void;
}

export function AgentCard({
  agent,
  teams,
  models,
  onUpdate,
  onDelete,
}: AgentCardProps) {
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(agent.name);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get the model name from the modelRef
  const modelName = agent.modelRef?.name || 'No model assigned';

  // Check if this is an A2A agent
  const isA2A = agent.isA2A || false;

  // Get custom icon or default Bot icon
  const IconComponent = getCustomIcon(
    agent.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Bot,
  );

  const actions: BaseCardAction[] = [];

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: 'Edit agent',
      onClick: () => setEditorOpen(true),
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete agent',
      onClick: () => setDeleteConfirmOpen(true),
      disabled: isChatOpen,
    });
  }

  actions.push({
    icon: MessageCircle,
    label: 'Chat with agent',
    onClick: () => toggleFloatingChat(agent.name, 'agent'),
    className: isChatOpen ? 'fill-current' : '',
  });

  return (
    <>
      <BaseCard
        title={agent.name}
        description={agent.description}
        icon={<IconComponent className="h-5 w-5" />}
        actions={actions}
        footer={
          <div className="flex w-full flex-row items-end justify-between">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" />
              {!isA2A && <span>Model: {modelName}</span>}
              {isA2A && <span>A2A Agent</span>}
            </div>
            <AvailabilityStatusBadge
              status={agent.available}
              eventsLink={{
                href: '/events',
                query: {
                  kind: 'Agent',
                  name: agent.name,
                  page: 1,
                },
              }}
            />
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
