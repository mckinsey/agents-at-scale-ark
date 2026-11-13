'use client';

import { type ComponentType, memo, useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import {
  Close,
  CollapseContent,
  ExpandContent,
  Group,
  Memory,
  SmartToy,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GraphEdge } from '@/lib/types/chat-message';
import { cn } from '@/lib/utils';

type ChatType = 'model' | 'team' | 'agent';

interface FloatingChatProps {
  id: string;
  name: string;
  type: ChatType;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
  minimized?: boolean;
  onMinimizedChange?: (id: string, minimized: boolean) => void;
  onClose: (id: string) => void;
}

const CHAT_TYPE_ICONS: Record<ChatType, ComponentType> = {
  agent: SmartToy,
  team: Group,
  model: Memory,
};

function FloatingChat({
  id,
  name,
  type,
  strategy,
  selectorAgentName,
  graphEdges,
  minimized,
  onMinimizedChange,
  onClose,
}: FloatingChatProps) {
  const [localMinimized, setLocalMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown');

  const isMinimized = minimized ?? localMinimized;
  const setMinimized = (value: boolean) =>
    onMinimizedChange ? onMinimizedChange(id, value) : setLocalMinimized(value);
  const handleClose = () => onClose(id);
  const TypeIcon = CHAT_TYPE_ICONS[type];

  const title = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <IconShell className="flex-shrink-0">
              <TypeIcon />
            </IconShell>
            <span className="text-fg-primary headings-h4-semibold truncate">
              {name}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  if (isMinimized) {
    return (
      <div className="bg-surface-bg-secondary border-stroke-divider shadow-elevation-2 flex h-9 w-full items-center gap-1 border py-1 pr-2 pl-3">
        {title}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMinimized(false)}
          aria-label="Restore chat">
          <IconShell size="sm">
            <ExpandContent />
          </IconShell>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          aria-label="Close chat">
          <IconShell size="sm">
            <Close />
          </IconShell>
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="chat-window"
      className={cn(
        'bg-surface-bg-base border-stroke-divider text-fg-primary shadow-elevation-2 flex flex-col overflow-hidden border transition-all duration-300',
        isMaximized
          ? 'fixed inset-4 z-50'
          : 'h-[708px] max-h-[calc(100vh-2.5rem)] w-full',
      )}>
      <div className="border-stroke-divider flex-shrink-0 border-b">
        <div className="flex h-12 items-center justify-between gap-1 px-3 py-2">
          {title}

          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setIsMaximized(false);
                setMinimized(true);
              }}
              aria-label="Minimize chat">
              <IconShell size="sm">
                <CollapseContent />
              </IconShell>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMaximized(!isMaximized)}
              aria-label={isMaximized ? 'Restore size' : 'Maximize chat'}>
              <IconShell size="sm">
                {isMaximized ? <CollapseContent /> : <ExpandContent />}
              </IconShell>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label="Close chat">
              <IconShell size="sm">
                <Close />
              </IconShell>
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex justify-end px-3 py-1.5">
          <div className="flex items-center gap-1 text-xs">
            <button
              className={cn(
                'px-2 py-1 transition-colors',
                viewMode === 'text'
                  ? 'bg-surface-bg-tertiary text-fg-primary font-medium'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-stateslayer-overlay-hover',
              )}
              onClick={() => setViewMode('text')}>
              Text
            </button>
            <button
              className={cn(
                'px-2 py-1 transition-colors',
                viewMode === 'markdown'
                  ? 'bg-surface-bg-tertiary text-fg-primary font-medium'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-stateslayer-overlay-hover',
              )}
              onClick={() => setViewMode('markdown')}>
              Markdown
            </button>
          </div>
        </div>
      </div>

      <ChatPanel
        name={name}
        type={type}
        strategy={strategy}
        selectorAgentName={selectorAgentName}
        graphEdges={graphEdges}
        viewMode={viewMode}
      />
    </div>
  );
}

export default memo(FloatingChat);
