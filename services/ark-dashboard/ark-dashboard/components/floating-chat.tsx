'use client';

import { Expand, MessageCircle, Minus, Shrink, Square, X } from 'lucide-react';
import { useState } from 'react';

import { ChatPanel } from '@/components/chat/chat-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type WindowState = 'default' | 'minimized' | 'maximized';

interface FloatingChatProps {
  id: string;
  name: string;
  type: ChatType;
  position: number;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
  onClose: () => void;
}

export default function FloatingChat({
  name,
  type,
  position,
  strategy,
  selectorAgentName,
  graphEdges,
  onClose,
}: FloatingChatProps) {
  const [windowState, setWindowState] = useState<WindowState>('default');
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown');

  const rightPosition = 16 + position * 420;

  // Handle window state styling
  const getCardStyles = () => {
    switch (windowState) {
      case 'maximized':
        return 'fixed inset-4 shadow-2xl dark:shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 transition-all duration-300';
      case 'minimized':
        return 'fixed bottom-4 shadow-2xl dark:shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 w-[400px] h-auto min-h-0 transition-all duration-300';
      case 'default':
      default:
        return 'fixed bottom-4 shadow-2xl dark:shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 w-[400px] h-[500px] transition-all duration-300';
    }
  };

  const isMinimized = windowState === 'minimized';
  const isMaximized = windowState === 'maximized';
  const cardStyles = getCardStyles();

  return (
    <Card
      className={`${cardStyles} p-0`}
      style={isMaximized ? {} : { right: `${rightPosition}px` }}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Dialog-style Header */}
        <div className="flex-shrink-0 border-b">
          {/* Title Row */}
          <div className="flex items-center justify-between px-3 py-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <MessageCircle className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                    <span className="truncate font-medium">{name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setWindowState(isMinimized ? 'default' : 'minimized')
                }
                className="h-6 w-6 p-0"
                aria-label={isMinimized ? 'Restore chat' : 'Minimize chat'}>
                {isMinimized ? (
                  <Square className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setWindowState(isMaximized ? 'default' : 'maximized')
                }
                className="h-6 w-6 p-0"
                aria-label={isMaximized ? 'Restore size' : 'Maximize chat'}>
                {isMaximized ? (
                  <Shrink className="h-3 w-3" />
                ) : (
                  <Expand className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
                aria-label="Close chat">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {!isMinimized && (
            <>
              <Separator />

              {/* Controls Row */}
              <div className="flex justify-end px-3 py-1.5">
                <div className="flex items-center gap-1 text-xs">
                  <button
                    className={`rounded px-2 py-1 transition-colors ${
                      viewMode === 'text'
                        ? 'bg-secondary text-secondary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setViewMode('text')}>
                    Text
                  </button>
                  <button
                    className={`rounded px-2 py-1 transition-colors ${
                      viewMode === 'markdown'
                        ? 'bg-secondary text-secondary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    onClick={() => setViewMode('markdown')}>
                    Markdown
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {!isMinimized && (
          <ChatPanel
            name={name}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
            viewMode={viewMode}
          />
        )}
      </div>
    </Card>
  );
}
