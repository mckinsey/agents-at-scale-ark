'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { RestartAlt, Send, SingleTool, Stop } from '@/components/icons';
import { NumericBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface ChatPanelProps {
  name: string;
  type: ChatType;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
  viewMode?: 'text' | 'markdown';
}

export function ChatPanel({
  name,
  type,
  strategy,
  selectorAgentName,
  graphEdges,
  viewMode,
}: ChatPanelProps) {
  const {
    messages,
    isProcessing,
    processingPhase,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
    tokenUsage,
    messageTokenUsage,
    cancelQuery,
  } = useChatSession({ name, type });

  const [currentMessage, setCurrentMessage] = useState('');
  const [debugMode, setDebugMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const switchId = useId();

  const toolCallCount = useMemo(
    () => messages.reduce((acc, m) => acc + (m.tool_calls?.length ?? 0), 0),
    [messages],
  );

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

  return (
    <>
      <ScrollArea className="border-stroke-divider h-0 flex-1 border-r">
        <div className="space-y-4 p-4">
          <ChatMessageList
            messages={messages}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
            debugMode={debugMode}
            isProcessing={isProcessing}
            processingPhase={processingPhase}
            error={error}
            viewMode={viewMode}
            messagesEndRef={messagesEndRef}
            messageTokenUsage={messageTokenUsage}
          />
        </div>
      </ScrollArea>

      <div className="bg-surface-bg-base border-stroke-divider flex flex-shrink-0 flex-col border-t border-r border-b pb-4">
        <div className="flex w-full flex-col gap-4 px-4 pt-3">
          <div className="bg-surface-bg-primary flex h-16 w-full items-center gap-2 p-3">
            <Input
              ref={inputRef}
              placeholder={
                isProcessing ? 'Processing...' : 'Type your message...'
              }
              value={currentMessage}
              onChange={e => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isProcessing}
              className="placeholder:text-fg-tertiary h-4 flex-1 border-0 bg-transparent p-0 text-sm font-normal shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 disabled:bg-transparent disabled:hover:bg-transparent"
            />
            {isProcessing ? (
              <Button
                onClick={cancelQuery}
                variant="ghost"
                size="icon"
                aria-label="Stop conversation"
                className="bg-surface-bg-tertiary hover:bg-surface-bg-tertiary/80 flex size-8 items-center justify-center">
                <IconShell size="sm" className="opacity-100">
                  <Stop />
                </IconShell>
              </Button>
            ) : (
              <Button
                onClick={handleSendMessage}
                disabled={!currentMessage.trim()}
                variant="ghost"
                size="icon"
                aria-label="Send message"
                className="bg-surface-bg-tertiary hover:bg-surface-bg-tertiary/80 flex size-8 items-center justify-center">
                <IconShell size="sm" className="opacity-100">
                  <Send />
                </IconShell>
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between self-stretch">
            <div className="flex items-center gap-3">
              <div className="relative">
                <IconShell size="sm" variant="secondary">
                  <SingleTool />
                </IconShell>
                {toolCallCount > 0 && (
                  <div className="absolute -top-2 -right-2">
                    <NumericBadge size="sm">{toolCallCount}</NumericBadge>
                  </div>
                )}
              </div>
              <Switch
                id={switchId}
                checked={debugMode}
                className="scale-75"
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
                htmlFor={switchId}
                className="text-fg-secondary cursor-pointer text-xs leading-4">
                Show tool calls
              </label>
              {tokenUsage && tokenUsage.total_tokens > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-fg-tertiary ml-2 font-mono text-xs">
                        {tokenUsage.total_tokens.toLocaleString()} tokens
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1 text-xs">
                        <div>
                          Prompt: {tokenUsage.prompt_tokens.toLocaleString()}
                        </div>
                        <div>
                          Completion:{' '}
                          {tokenUsage.completion_tokens.toLocaleString()}
                        </div>
                        <div className="border-t pt-1 font-medium">
                          Total: {tokenUsage.total_tokens.toLocaleString()}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={clearChat}
              className="gap-1"
              disabled={isProcessing || messages.length === 0}>
              <IconShell size="sm">
                <RestartAlt />
              </IconShell>
              New Chat
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
