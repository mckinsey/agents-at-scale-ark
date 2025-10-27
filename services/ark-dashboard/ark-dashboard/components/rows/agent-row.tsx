'use client';

import { Bot, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AgentEditor } from '@/components/editors';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { cn } from '@/lib/utils';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

interface AgentRowProps {
  readonly agent: Agent;
  readonly teams: Team[];
  readonly models: Model[];
  readonly onUpdate?: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string },
  ) => void;
  readonly onDelete?: (id: string) => void;
}

export function AgentRow({
  agent,
  teams,
  models,
  onUpdate,
  onDelete,
}: AgentRowProps) {
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

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3 transition-colors">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />

          <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={agent.name}>
              {agent.name}
            </p>
            <p
              className="text-muted-foreground truncate text-xs"
              title={agent.description || ''}>
              {agent.description || 'No description'}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground mr-4 flex-shrink-0 text-sm">
          {!isA2A && <span>Model: {modelName}</span>}
          {isA2A && <span>A2A Agent</span>}
        </div>

        <AvailabilityStatusBadge
          status={agent.available}
          eventsLink={`/events?kind=Agent&name=${agent.name}&page=1`}
        />

        <div className="flex flex-shrink-0 items-center gap-1">
          {onUpdate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setEditorOpen(true)}>
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
                      'h-8 w-8 p-0',
                      isChatOpen && 'cursor-not-allowed opacity-50',
                    )}
                    onClick={() => !isChatOpen && setDeleteConfirmOpen(true)}
                    disabled={isChatOpen}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isChatOpen ? 'Cannot delete agent in use' : 'Delete agent'}
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
                  className={cn('h-8 w-8 p-0', isChatOpen && 'text-primary')}
                  onClick={() => toggleFloatingChat(agent.name, 'agent')}>
                  <MessageCircle
                    className={cn('h-4 w-4', isChatOpen && 'fill-primary')}
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
