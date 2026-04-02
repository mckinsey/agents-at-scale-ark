'use client';

import { AlertTriangle, MessageCircle, Pencil, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
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
import type {
  Agent,
  Team,
  TeamCreateRequest,
  TeamUpdateRequest,
} from '@/lib/services';
import { cn } from '@/lib/utils';

interface TeamRowProps {
  readonly team: Team;
  readonly agents: Agent[];
  readonly onUpdate?: (
    team: (TeamCreateRequest | TeamUpdateRequest) & { id?: string },
  ) => void;
  readonly onDelete?: (id: string) => void;
}

export function TeamRow({
  team,
  agents: _agents,
  onUpdate: _onUpdate,
  onDelete,
}: TeamRowProps) {
  const router = useRouter();
  const { isOpen } = useChatState();
  const isChatOpen = isOpen(team.name);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const memberCount = team.members?.length || 0;
  const deprecatedStrategies = ['round-robin', 'graph'];
  const isDeprecatedStrategy = deprecatedStrategies.includes(
    team.strategy ?? '',
  );

  const strategyDisplayMap: Record<string, string> = {
    sequential: team.loops ? 'Sequential (Loops)' : 'Sequential',
    selector: 'Selector',
    graph: 'Graph (Deprecated)',
    'round-robin': 'Round Robin (Deprecated)',
  };

  const strategyDisplay =
    strategyDisplayMap[team.strategy ?? ''] || team.strategy || 'No strategy';

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        className="bg-card hover:bg-accent/5 flex w-full cursor-pointer flex-wrap items-center gap-4 rounded-md border px-4 py-3 transition-colors"
        onClick={() => router.push(`/teams/${encodeURIComponent(team.name)}`)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            router.push(`/teams/${encodeURIComponent(team.name)}`);
          }
        }}>
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <Users className="text-muted-foreground h-5 w-5 flex-shrink-0" />

          <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={team.name}>
              {team.name}
            </p>
            <p
              className="text-muted-foreground truncate text-xs"
              title={team.description || ''}>
              {team.description || 'No description'}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground mr-4 flex-shrink-0 text-sm">
          <span>
            {memberCount} member{memberCount !== 1 ? 's' : ''} ·{' '}
            {strategyDisplay}
            {isDeprecatedStrategy && (
              <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-yellow-500" />
            )}
          </span>
        </div>

        <AvailabilityStatusBadge
          status={team.available}
          eventsLink={`/events?kind=Team&name=${team.name}&page=1`}
        />

        <div className="flex flex-shrink-0 items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/teams/${encodeURIComponent(team.name)}`);
                  }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View team</TooltipContent>
            </Tooltip>
          </TooltipProvider>

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
                    onClick={e => {
                      e.stopPropagation();
                      if (!isChatOpen) setDeleteConfirmOpen(true);
                    }}
                    disabled={isChatOpen}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isChatOpen ? 'Cannot delete team in use' : 'Delete team'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {memberCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 w-8 p-0', isChatOpen && 'text-primary')}
                    onClick={e => {
                      e.stopPropagation();
                      toggleFloatingChat(
                        team.name,
                        'team',
                        team.strategy,
                        team.graph?.edges ?? undefined,
                      );
                    }}>
                    <MessageCircle
                      className={cn('h-4 w-4', isChatOpen && 'fill-primary')}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chat with team</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

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
