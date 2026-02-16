'use client';

import {
  Expand,
  MessageCircle,
  Minus,
  RotateCcw,
  Send,
  Shrink,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trackEvent } from '@/lib/analytics/singleton';
import { useChatSession } from '@/lib/hooks';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type WindowState = 'default' | 'minimized' | 'maximized';

interface FloatingChatProps {
  id: string;
  name: string;
  type: ChatType;
  position: number;
  strategy?: string;
  graphEdges?: GraphEdge[];
  onClose: () => void;
}

export default function FloatingChat({
  name,
  type,
  position,
  strategy,
  graphEdges,
  onClose,
}: FloatingChatProps) {
  const {
    messages,
    isProcessing,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
  } = useChatSession({ name, type });

  const [currentMessage, setCurrentMessage] = useState('');
  const [windowState, setWindowState] = useState<WindowState>('default');
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown');
  const [debugMode, setDebugMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    inputRef.current?.focus();
    await sendMessage(userMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Calculate position - each window is 420px wide (400px + 20px gap)
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
          <>
            <div
              className="flex-1 overflow-y-auto p-4"
              style={{ minHeight: 0 }}>
              <div className="space-y-4">
                <ChatMessageList
                  messages={messages}
                  type={type}
                  strategy={strategy}
                  graphEdges={graphEdges}
                  debugMode={debugMode}
                  isProcessing={isProcessing}
                  error={error}
                  viewMode={viewMode}
                  messagesEndRef={messagesEndRef}
                />
              </div>
            </div>

            <div className="flex-shrink-0 border-t">
              <div className="flex gap-2 p-4">
                <div className="relative flex-1">
                  <Input
                    ref={inputRef}
                    placeholder={
                      isProcessing ? 'Processing...' : 'Type your message...'
                    }
                    value={currentMessage}
                    onChange={e => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isProcessing}
                  />
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || isProcessing}
                  size="sm"
                  variant="default"
                  aria-label="Send message">
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* Toolbar */}
              <div className="border-t px-4 py-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="debug-mode"
                    checked={debugMode}
                    onCheckedChange={checked => {
                      setDebugMode(checked);
                      trackEvent({
                        name: 'chat_debug_mode_toggled',
                        properties: {
                          enabled: checked,
                          targetType: type,
                          targetName: name,
                        },
                      });
                    }}
                  />
                  <label
                    htmlFor="debug-mode"
                    className="text-muted-foreground cursor-pointer text-sm">
                    Show tool calls
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearChat}
                    className="ml-auto h-7 gap-1 px-2 text-xs"
                    disabled={isProcessing || messages.length === 0}>
                    <RotateCcw className="h-3 w-3" />
                    New Chat
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
