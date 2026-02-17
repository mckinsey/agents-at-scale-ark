'use client';

import { useAtom, useAtomValue } from 'jotai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { chatHistoryAtom, createNewSessionId } from '@/atoms/chat-history';
import {
  isChatStreamingEnabledAtom,
  queryTimeoutSettingAtom,
} from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import { trackEvent } from '@/lib/analytics/singleton';
import { hashPromptSync } from '@/lib/analytics/utils';
import { chatService } from '@/lib/services';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';

interface UseChatSessionParams {
  name: string;
  type: ChatType;
}

interface UseChatSessionReturn {
  messages: ExtendedChatMessage[];
  sessionId: string;
  isProcessing: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function useChatSession({
  name,
  type,
}: UseChatSessionParams): UseChatSessionReturn {
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

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const queryTimeout = useAtomValue(queryTimeoutSettingAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [chatMessages, scrollToBottom]);

  const buildChatMessages = useCallback(
    (
      messages: ExtendedChatMessage[],
      currentMsg: string,
    ): ExtendedChatMessage[] => {
      return [
        ...messages,
        { role: 'user', content: currentMsg } as ExtendedChatMessage,
      ];
    },
    [],
  );

  const handleStreamChatResponse = useCallback(
    async (userMessage: string) => {
      const messageArray = buildChatMessages(chatMessages, userMessage);
      let currentMessageIndex = chatMessages.length + 1;

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
      let currentAgent: string | undefined;
      let turnComplete = false;
      let completedQueryMessages: Array<{
        role: string;
        content?: string;
        name?: string;
      }> = [];

      const finalizeCurrentMessage = () => {
        if (accumulatedContent || accumulatedToolCalls.length > 0) {
          updateChatMessages(prev => {
            const updated = [...prev];
            const updatedMessage: ExtendedChatMessage = {
              role: 'assistant',
              content: accumulatedContent,
              tool_calls:
                accumulatedToolCalls.length > 0
                  ? accumulatedToolCalls
                  : undefined,
            } as ExtendedChatMessage;
            if (currentAgent) {
              (updatedMessage as { name?: string }).name = currentAgent;
            }
            updated[currentMessageIndex] = updatedMessage;
            return updated;
          });
        }
      };

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
                response?: {
                  content?: string;
                  raw?: string;
                };
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
          const rawMessages = arkData.completedQuery?.status?.response?.raw;
          if (rawMessages) {
            try {
              completedQueryMessages = JSON.parse(rawMessages);
            } catch (e) {
              console.error('Failed to parse completed query messages:', e);
            }
          }
        }

        if ('ark' in chunk) {
          const arkData = chunk.ark as { agent?: string };
          const chunkAgent = arkData.agent;

          if (chunkAgent && (chunkAgent !== currentAgent || turnComplete)) {
            if (currentAgent) {
              finalizeCurrentMessage();
              accumulatedContent = '';
              accumulatedToolCalls.length = 0;
              currentMessageIndex++;
              updateChatMessages(prev => [
                ...prev,
                { role: 'assistant', content: '' } as ExtendedChatMessage,
              ]);
            }
            currentAgent = chunkAgent;
            turnComplete = false;
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
          const updatedMessage: ExtendedChatMessage = {
            role: 'assistant',
            content: accumulatedContent,
            tool_calls:
              accumulatedToolCalls.length > 0
                ? accumulatedToolCalls
                : undefined,
          } as ExtendedChatMessage;
          if (currentAgent) {
            (updatedMessage as { name?: string }).name = currentAgent;
          }
          updated[currentMessageIndex] = updatedMessage;
          return updated;
        });

        const finishReason = typedChunk?.choices?.[0]?.finish_reason;
        if (finishReason) {
          turnComplete = true;
        }
      }

      finalizeCurrentMessage();

      if (hasError) {
        const hasTerminateToolCall = accumulatedToolCalls.some(
          tc => tc.function.name === 'terminate',
        );
        if (!hasTerminateToolCall) {
          updateChatMessages(prev => {
            const updated = [...prev];
            updated[currentMessageIndex] = {
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
      }

      if (completedQueryMessages.length > 0) {
        const systemMessages = completedQueryMessages.filter(
          msg => msg.role === 'system',
        );
        if (systemMessages.length > 0) {
          updateChatMessages(prev => [
            ...prev,
            ...systemMessages.map(
              msg =>
                ({
                  role: 'system',
                  content: msg.content || '',
                }) as ExtendedChatMessage,
            ),
          ]);
        }
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
    },
    [
      buildChatMessages,
      chatMessages,
      name,
      queryTimeout,
      sessionId,
      type,
      updateChatMessages,
    ],
  );

  const handlePollChatResponse = useCallback(
    async (userMessage: string) => {
      const messageArray = buildChatMessages(chatMessages, userMessage);

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
                } as ExtendedChatMessage,
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
                } as ExtendedChatMessage,
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
            } as ExtendedChatMessage,
          ]);
          pollingStopped = true;
        }

        if (!pollingStopped) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    },
    [
      buildChatMessages,
      chatMessages,
      name,
      queryTimeout,
      sessionId,
      type,
      updateChatMessages,
    ],
  );

  const sendMessage = useCallback(
    async (userMessage: string) => {
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

      updateChatMessages(prev => [
        ...prev,
        { role: 'user', content: userMessage } as ExtendedChatMessage,
      ]);

      setIsProcessing(true);

      try {
        if (isChatStreamingEnabled) {
          await handleStreamChatResponse(userMessage);
        } else {
          await handlePollChatResponse(userMessage);
        }
      } catch (err) {
        console.error('Error sending message:', err);
        let errMsg = 'Failed to send message';

        if (err instanceof Error) {
          if (err.message.includes('Failed to fetch')) {
            errMsg =
              'Unable to connect to the ARK API. Please ensure the backend service is running on port 8000.';
          } else {
            errMsg = err.message;
          }
        }

        updateChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: errMsg,
            metadata: {
              status: 'failed',
            },
          } as ExtendedChatMessage,
        ]);
        setError(errMsg);
      } finally {
        setIsProcessing(false);
      }
    },
    [
      handlePollChatResponse,
      handleStreamChatResponse,
      isChatStreamingEnabled,
      name,
      type,
      updateChatMessages,
    ],
  );

  const clearChat = useCallback(() => {
    const newSessionId = createNewSessionId();
    initSessionIdRef.current = newSessionId;
    setLastConversationId(newSessionId);
    setChatHistory(prev => ({
      ...(prev || {}),
      [chatKey]: { messages: [], sessionId: newSessionId },
    }));
    setError(null);
  }, [chatKey, setChatHistory, setLastConversationId]);

  return {
    messages: chatMessages,
    sessionId,
    isProcessing,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
  };
}
