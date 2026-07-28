'use client';

import { useEffect, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { Autorenew, Build, Info, Send, Stop } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ChatParameterFields } from '@/components/ui/chat-parameter-fields';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trackEvent } from '@/lib/analytics/singleton';
import { useChatSession } from '@/lib/hooks';
import type { GraphEdge } from '@/lib/types/chat-message';
import { cn } from '@/lib/utils';

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
    statusText,
    isWaitingForApprovalResponse,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
    tokenUsage,
    messageTokenUsage,
    cancelQuery,
    pollAfterApproval,
    parameterVariant,
    hasParameters,
    availableParameters,
    teamAgents,
    parameterRows,
    addParameterRow,
    setParameterRowName,
    setParameterRowValue,
    setParameterRowAgent,
    removeParameterRow,
    canAddParameterRow,
    missingParameters,
  } = useChatSession({ name, type });

  const [currentMessage, setCurrentMessage] = useState('');
  const [debugMode, setDebugMode] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toolCallCount = messages.reduce(
    (total, msg) =>
      total + ('tool_calls' in msg && msg.tool_calls ? msg.tool_calls.length : 0),
    0,
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
      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {missingParameters.length > 0 && (
            <div className="bg-fill-onsurface-ui-3 text-fg-secondary flex items-center gap-2 rounded-full px-4 py-2">
              <IconShell className="text-status-information shrink-0">
                <Info />
              </IconShell>
              <span className="text-sm">
                This {type === 'team' ? 'team' : 'agent'} needs a value
                definition before you can send a message. Please add it below.
              </span>
            </div>
          )}
          <ChatMessageList
            messages={messages}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
            debugMode={debugMode}
            isProcessing={isProcessing}
            processingPhase={processingPhase}
            statusText={statusText}
            isWaitingForApprovalResponse={isWaitingForApprovalResponse}
            error={error}
            viewMode={viewMode}
            messagesEndRef={messagesEndRef}
            messageTokenUsage={messageTokenUsage}
            pollAfterApproval={pollAfterApproval}
          />
        </div>
      </ScrollArea>

      <div className="border-stroke-divider flex-shrink-0 border-t">
        {hasParameters && (
          <div className="px-4 pt-4">
            {parameterVariant === 'team' ? (
              <ChatParameterFields
                variant="team"
                teamAgents={teamAgents}
                rows={parameterRows}
                onAddRow={addParameterRow}
                onChangeAgent={setParameterRowAgent}
                onChangeName={setParameterRowName}
                onChangeValue={setParameterRowValue}
                onRemoveRow={removeParameterRow}
                canAddRow={canAddParameterRow}
                disabled={isProcessing}
              />
            ) : (
              <ChatParameterFields
                variant="agent"
                availableParameters={availableParameters}
                rows={parameterRows}
                onAddRow={addParameterRow}
                onChangeName={setParameterRowName}
                onChangeValue={setParameterRowValue}
                onRemoveRow={removeParameterRow}
                canAddRow={canAddParameterRow}
                disabled={isProcessing}
              />
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 px-4 py-3">
          <Textarea
            ref={inputRef}
            rows={1}
            autoResize
            maxRows={17}
            placeholder={
              isProcessing ? 'Processing...' : 'Type your message...'
            }
            value={currentMessage}
            onChange={e => setCurrentMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isProcessing}
            className="min-h-0 w-full resize-none border-0 bg-transparent px-0 py-1 text-sm font-normal leading-5 shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 disabled:bg-transparent disabled:hover:bg-transparent placeholder:text-fg-tertiary"
          />

          <TooltipProvider>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="New chat"
                      onClick={clearChat}
                      disabled={isProcessing || messages.length === 0}>
                      <IconShell size="sm" variant="secondary">
                        <Autorenew />
                      </IconShell>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New chat</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-pressed={debugMode}
                      aria-label={
                        debugMode
                          ? 'Disable tool calls'
                          : 'Activate tool calls'
                      }
                      onClick={() => {
                        const enabled = !debugMode;
                        setDebugMode(enabled);
                        trackEvent({
                          name: 'chat_debug_mode_toggled',
                          properties: {
                            enabled,
                            targetType: type,
                            targetName: name,
                          },
                        });
                      }}
                      className="relative">
                      <IconShell size="sm" variant="secondary">
                        <Build />
                      </IconShell>
                      <span
                        className={cn(
                          'absolute -right-0.5 -top-0.5 size-2 rounded-full',
                          debugMode ? 'bg-status-success' : 'bg-status-error',
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {debugMode ? 'Disable tool calls' : 'Activate tool calls'}
                  </TooltipContent>
                </Tooltip>

                {toolCallCount > 0 && (
                  <span className="text-fg-tertiary ml-1 font-mono text-xs">
                    {toolCallCount.toLocaleString()} tool{' '}
                    {toolCallCount === 1 ? 'call' : 'calls'}
                  </span>
                )}

                {tokenUsage && tokenUsage.total_tokens > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-fg-tertiary ml-1 font-mono text-xs">
                        {tokenUsage.total_tokens.toLocaleString()} tokens
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1 text-xs">
                        <div>
                          Input (new):{' '}
                          {Math.max(
                            0,
                            tokenUsage.prompt_tokens - tokenUsage.cached_tokens,
                          ).toLocaleString()}
                        </div>
                        {tokenUsage.cached_tokens > 0 && (
                          <div>
                            Cached: {tokenUsage.cached_tokens.toLocaleString()}
                          </div>
                        )}
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
                )}
              </div>

              {isProcessing ? (
                <Button
                  onClick={cancelQuery}
                  size="icon-sm"
                  variant="destructive"
                  aria-label="Stop conversation">
                  <IconShell size="sm">
                    <Stop />
                  </IconShell>
                </Button>
              ) : (
                <Button
                  onClick={handleSendMessage}
                  disabled={
                    !currentMessage.trim() || missingParameters.length > 0
                  }
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Send message"
                  className="bg-fill-active text-fg-primary-inverse hover:bg-fill-active/90 disabled:bg-surface-bg-tertiary disabled:text-fg-tertiary">
                  <IconShell size="sm">
                    <Send />
                  </IconShell>
                </Button>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </>
  );
}
