'use client';

import { useAtom, useAtomValue } from 'jotai';
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
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { chatHistoryAtom, createNewSessionId } from '@/atoms/chat-history';
import {
  isChatStreamingEnabledAtom,
  queryTimeoutSettingAtom,
} from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
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
import { hashPromptSync } from '@/lib/analytics/utils';
import { chatService } from '@/lib/services';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';
type WindowState = 'default' | 'minimized' | 'maximized';

interface FloatingChatProps {
  id: string;
  name: string;
  type: ChatType;
  position: number;
  strategy?: string;
  onClose: () => void;
}

export default function FloatingChat({
  name,
  type,
  position,
  strategy,
  onClose,
}: FloatingChatProps) {
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [lastConversationId, setLastConversationId] = useAtom(
    lastConversationIdAtom,
  );
  const chatKey = `${type}-${name}`;

  const initSessionIdRef = useRef<string>(
    lastConversationId || createNewSessionId(),
  );

  const chatSession = useMemo(() => {
    const existing = chatHistory?.[chatKey];
    if (existing?.messages !== undefined && existing?.sessionId) {
      return existing;
    }
    return { messages: [], sessionId: initSessionIdRef.current };
  }, [chatHistory, chatKey]);

  const chatMessages = chatSession.messages;
  const sessionId = chatSession.sessionId;

  useEffect(() => {
    if (!chatHistory?.[chatKey]) {
      const sessionIdToUse = initSessionIdRef.current;
      setLastConversationId(sessionIdToUse);
      setChatHistory(prev => ({
        ...(prev || {}),
        [chatKey]: { messages: [], sessionId: sessionIdToUse },
      }));
    }
  }, [chatKey, chatHistory, setChatHistory, setLastConversationId]);

  const updateChatMessages = useCallback(
    (
      updater:
        | ExtendedChatMessage[]
        | ((prev: ExtendedChatMessage[]) => ExtendedChatMessage[]),
    ) => {
      setChatHistory(prev => {
        const safePrev = prev || {};
        const currentSession = safePrev[chatKey];
        if (!currentSession) return safePrev;
        const currentMessages = currentSession.messages || [];
        const newMessages =
          typeof updater === 'function' ? updater(currentMessages) : updater;
        return {
          ...safePrev,
          [chatKey]: { ...currentSession, messages: newMessages },
        };
      });
    },
    [chatKey, setChatHistory],
  );

  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowState, setWindowState] = useState<WindowState>('default');
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown');
  const [debugMode, setDebugMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const queryTimeout = useAtomValue(queryTimeoutSettingAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Focus input when chat opens
    setTimeout(() => inputRef.current?.focus(), 100);

    // Cleanup: stop polling when component unmounts
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    // Focus input when processing completes
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(scrollToBottom, 100);
  }, [chatMessages]);

  const buildChatMessages = (
    messages: ExtendedChatMessage[],
    currentMsg: string,
  ): ExtendedChatMessage[] => {
    return [
      ...messages,
      { role: 'user', content: currentMsg } as ExtendedChatMessage,
    ];
  };

  const handleStreamChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);

    const assistantMessageIndex = chatMessages.length + 1;
    updateChatMessages(prev => [
      ...prev,
      { role: 'assistant', content: '' } as ExtendedChatMessage,
    ]);

    let accumulatedContent = '';
    const accumulatedToolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    let hasError = false;
    let errorMessage = '';
    let queryName = '';

    for await (const chunk of chatService.streamChatResponse(
      messageArray as ChatCompletionMessageParam[],
      type,
      name,
      sessionId,
      queryTimeout,
    )) {
      if ('error' in chunk && chunk.error) {
        hasError = true;
        const errorObj = chunk.error as {
          message?: string;
          code?: string;
        };
        errorMessage = errorObj.message || 'An error occurred';
        if ('ark' in chunk) {
          const arkData = chunk.ark as { query?: string };
          queryName = arkData.query || '';
        }
        break;
      }

      const typedChunk = chunk as unknown as ChatCompletionChunk;

      if (typedChunk?.id === 'chatcmpl-final' && 'ark' in chunk) {
        const arkData = chunk.ark as {
          completedQuery?: {
            metadata?: { name?: string };
            status?: {
              phase?: string;
              response?: { content?: string };
            };
          };
        };
        if (arkData.completedQuery?.status?.phase === 'error') {
          hasError = true;
          errorMessage =
            arkData.completedQuery.status.response?.content || 'Query failed';
          queryName = arkData.completedQuery.metadata?.name || '';
          break;
        }
      }

      const delta = typedChunk?.choices?.[0]?.delta;
      if (delta?.content) {
        accumulatedContent += delta.content;
      }

      if (delta?.tool_calls) {
        let index = accumulatedToolCalls.length - 1;
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.function?.name) {
            index += 1;
            accumulatedToolCalls.push({
              id: toolCallDelta.id || '',
              type: 'function',
              function: { name: toolCallDelta.function.name, arguments: '' },
            });
          }

          if (toolCallDelta.id) {
            accumulatedToolCalls[index].id = toolCallDelta.id;
          }

          if (toolCallDelta.function?.arguments) {
            accumulatedToolCalls[index].function.arguments +=
              toolCallDelta.function.arguments;
          }
        }
      }
      updateChatMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          role: 'assistant',
          content: accumulatedContent,
          tool_calls: accumulatedToolCalls,
        } as ExtendedChatMessage;
        return updated;
      });
    }

    if (hasError) {
      updateChatMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          role: 'assistant',
          content: errorMessage,
          metadata: {
            status: 'failed',
            queryName: queryName || undefined,
          },
        } as ExtendedChatMessage;
        return updated;
      });
      return;
    }

    if (accumulatedToolCalls.length > 0) {
      updateChatMessages(prev => {
        const newMessages = [...prev];
        accumulatedToolCalls.forEach(toolCall => {
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Called ${toolCall.function.name} with ${toolCall.function.arguments}`,
          } as ExtendedChatMessage);
        });
        return newMessages;
      });
    }
  };

  const handlePollChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);

    // Add empty assistant message that will be updated with streamed content
    // const assistantMessageIndex = chatMessages.length + 1; // +1 for user message already added
    // updateChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const query = await chatService.submitChatQuery(
      messageArray as ChatCompletionMessageParam[],
      type,
      name,
      sessionId,
      undefined,
      queryTimeout,
    );

    let pollingStopped = false;
    stopPollingRef.current = () => {
      pollingStopped = true;
    };

    while (!pollingStopped) {
      try {
        const result = await chatService.getQueryResult(query.name);

        if (result.terminal) {
          if (result.status === 'done') {
            if (result.messages && result.messages.length > 0) {
              updateChatMessages(prev => [
                ...prev,
                ...result.messages!.map((msg): ExtendedChatMessage => {
                  if (msg.role === 'tool') {
                    return {
                      role: 'tool',
                      content: msg.content || '',
                      tool_call_id: msg.tool_call_id || '',
                    } as ExtendedChatMessage;
                  } else if (msg.role === 'assistant') {
                    const baseMsg: {
                      role: 'assistant';
                      content: string;
                      name?: string;
                      tool_calls?: Array<{
                        id: string;
                        type: 'function';
                        function: { name: string; arguments: string };
                      }>;
                    } = {
                      role: 'assistant' as const,
                      content: msg.content || '',
                    };
                    if (msg.name) {
                      baseMsg.name = msg.name;
                    }
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                      baseMsg.tool_calls = msg.tool_calls.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: tc.function,
                      }));
                    }
                    return baseMsg as ExtendedChatMessage;
                  } else if (msg.role === 'user') {
                    const baseMsg = {
                      role: 'user' as const,
                      content: msg.content || '',
                    };
                    if (msg.name) {
                      return {
                        ...baseMsg,
                        name: msg.name,
                      } as ExtendedChatMessage;
                    }
                    return baseMsg as ExtendedChatMessage;
                  } else {
                    return {
                      role: 'system',
                      content: msg.content || '',
                    } as ExtendedChatMessage;
                  }
                }),
              ]);
            } else if (result.response) {
              updateChatMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: result.response!,
                } as ExtendedChatMessage,
              ]);
            }
          } else if (result.status === 'error') {
            updateChatMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: result.response || 'Query failed',
                metadata: {
                  status: 'failed',
                  queryName: query.name,
                },
              },
            ]);
          } else if (result.status === 'unknown') {
            updateChatMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: 'Query status unknown',
                metadata: {
                  status: 'failed',
                  queryName: query.name,
                },
              },
            ]);
          }

          pollingStopped = true;
          break;
        }
      } catch (err) {
        console.error('Error polling query status:', err);

        updateChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: 'Error while processing query',
            metadata: {
              status: 'failed',
              queryName: query.name,
            },
          },
        ]);

        pollingStopped = true;
      }

      if (!pollingStopped) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    setError(null);

    trackEvent({
      name: 'chat_message_sent',
      properties: {
        targetType: type,
        targetName: name,
        messageLength: userMessage.length,
        promptHash: hashPromptSync(userMessage),
      },
    });

    // Add user message
    updateChatMessages(prev => [
      ...prev,
      { role: 'user', content: userMessage } as ExtendedChatMessage,
    ]);

    // Keep focus on input
    inputRef.current?.focus();

    setIsProcessing(true);

    try {
      if (isChatStreamingEnabled && type !== 'team') {
        await handleStreamChatResponse(userMessage);
      } else {
        await handlePollChatResponse(userMessage);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      let errorMessage = 'Failed to send message';

      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          errorMessage =
            'Unable to connect to the ARK API. Please ensure the backend service is running on port 8000.';
        } else {
          errorMessage = err.message;
        }
      }

      updateChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: errorMessage,
          metadata: {
            status: 'failed',
          },
        },
      ]);
      setError(errorMessage);
      setIsProcessing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = useCallback(() => {
    const newSessionId = createNewSessionId();
    initSessionIdRef.current = newSessionId;
    setLastConversationId(newSessionId);
    setChatHistory(prev => ({
      ...(prev || {}),
      [chatKey]: { messages: [], sessionId: newSessionId },
    }));
    setError(null);
  }, [chatKey, setChatHistory, setLastConversationId]);

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
                  messages={chatMessages}
                  type={type}
                  strategy={strategy}
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
                    onClick={handleClearChat}
                    className="ml-auto h-7 gap-1 px-2 text-xs"
                    disabled={isProcessing || chatMessages.length === 0}>
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
