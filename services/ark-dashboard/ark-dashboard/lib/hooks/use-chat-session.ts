'use client';

import { useAtom, useAtomValue } from 'jotai';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type TokenUsage,
  chatHistoryAtom,
  createNewSessionId,
} from '@/atoms/chat-history';
import {
  isChatStreamingEnabledAtom,
  queryTimeoutSettingAtom,
} from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import { trackEvent } from '@/lib/analytics/singleton';
import { hashPromptSync } from '@/lib/analytics/utils';
import type { ChatType } from '@/lib/chat-events';
import { chatService } from '@/lib/services';
import type {
  ArkExtendedChunk,
  ExtendedChatMessage,
} from '@/lib/types/chat-message';

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
  tokenUsage?: TokenUsage;
  messageTokenUsage?: Record<number, TokenUsage>;
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

  const pendingSessionIdRef = useRef<string | null>(null);

  const chatSession = useMemo(() => {
    const existing = chatHistory?.[chatKey];
    if (existing?.messages !== undefined && existing?.sessionId) {
      return existing;
    }
    if (!pendingSessionIdRef.current) {
      pendingSessionIdRef.current = createNewSessionId(name);
    }
    return { messages: [], sessionId: pendingSessionIdRef.current };
  }, [chatHistory, chatKey, name]);

  const chatMessages = chatSession.messages;
  const sessionId = chatSession.sessionId;
  const conversationId = (chatSession as { conversationId?: string }).conversationId;

  useEffect(() => {
    if (!chatHistory?.[chatKey]) {
      const sessionIdToUse = pendingSessionIdRef.current ?? createNewSessionId(name);
      pendingSessionIdRef.current = sessionIdToUse;
      setLastConversationId(sessionIdToUse);
      setChatHistory(prev => ({
        ...(prev || {}),
        [chatKey]: { messages: [], sessionId: sessionIdToUse },
      }));
    }
  }, [chatKey, chatHistory, name, setChatHistory, setLastConversationId]);

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

  const updateTokenUsage = useCallback(
    (usage: TokenUsage) => {
      setChatHistory(prev => {
        const safePrev = prev || {};
        const currentSession = safePrev[chatKey];
        if (!currentSession) return safePrev;
        const currentUsage = currentSession.tokenUsage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };
        return {
          ...safePrev,
          [chatKey]: {
            ...currentSession,
            tokenUsage: {
              prompt_tokens: currentUsage.prompt_tokens + usage.prompt_tokens,
              completion_tokens:
                currentUsage.completion_tokens + usage.completion_tokens,
              total_tokens: currentUsage.total_tokens + usage.total_tokens,
            },
          },
        };
      });
    },
    [chatKey, setChatHistory],
  );

  const updateConversationId = useCallback(
    (newConversationId: string) => {
      setChatHistory(prev => {
        const safePrev = prev || {};
        const currentSession = safePrev[chatKey];
        if (!currentSession) return safePrev;
        return {
          ...safePrev,
          [chatKey]: { ...currentSession, conversationId: newConversationId },
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
      const turnStartIndex = chatMessages.length + 1;
      let currentMessageIndex = turnStartIndex;

      updateChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: '' } as ExtendedChatMessage,
      ]);

      let accumulatedContent = '';
      let messageTokenUsage: TokenUsage | null = null;
      const accumulatedToolCalls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }> = [];
      const pendingSystemMessages: Array<string> = [];

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
                  ? [...accumulatedToolCalls]
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

      const addSystemMessagesAndNewAssistant = () => {
        const systemMsgCount = pendingSystemMessages.length;
        updateChatMessages(prev => {
          const systemMsgs = pendingSystemMessages.map(content => ({
            role: 'system' as const,
            content,
          }));
          return [
            ...prev,
            ...systemMsgs,
            { role: 'assistant', content: '' } as ExtendedChatMessage,
          ];
        });
        pendingSystemMessages.length = 0;
        currentMessageIndex += systemMsgCount + 1;
      };

      for await (const chunk of chatService.streamChatResponse(
        userMessage,
        type,
        name,
        sessionId,
        conversationId,
        queryTimeout,
      )) {
        const typedChunk = chunk as unknown as ArkExtendedChunk;

        if (typedChunk.error) {
          hasError = true;
          errorMessage = typedChunk.error.message || 'An error occurred';
          queryName = typedChunk.ark?.query || '';
          break;
        }

        if (typedChunk?.id === 'chatcmpl-final' && typedChunk.ark) {
          const arkData = typedChunk.ark;

          const returnedConversationId =
            arkData.completedQuery?.status?.conversationId;
          if (returnedConversationId) {
            updateConversationId(returnedConversationId);
          }

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

          const arkTokenUsage =
            arkData.completedQuery?.status?.tokenUsage;
          const usage: TokenUsage | null = arkTokenUsage
            ? {
                prompt_tokens: arkTokenUsage.promptTokens || 0,
                completion_tokens: arkTokenUsage.completionTokens || 0,
                total_tokens: arkTokenUsage.totalTokens || 0,
              }
            : typedChunk?.usage
              ? {
                  prompt_tokens: typedChunk.usage.prompt_tokens ?? 0,
                  completion_tokens: typedChunk.usage.completion_tokens ?? 0,
                  total_tokens: typedChunk.usage.total_tokens ?? 0,
                }
              : null;

          if (usage) {
            messageTokenUsage = usage;
            updateTokenUsage(usage);
          }
        }

        if (typedChunk.ark) {
          const arkData = typedChunk.ark;

          if (arkData.systemMessage) {
            pendingSystemMessages.push(arkData.systemMessage);
          }

          const chunkAgent = arkData.agent;

          // Check if we need to start a new assistant message
          const isNewAgent = chunkAgent && chunkAgent !== currentAgent;
          const isNewTurn = chunkAgent === currentAgent && turnComplete;

          if (isNewAgent || isNewTurn) {
            // Finalize previous message if it exists
            if (currentAgent) {
              finalizeCurrentMessage();
              accumulatedContent = '';
              accumulatedToolCalls.length = 0;
            }

            // Add system messages + new assistant message
            addSystemMessagesAndNewAssistant();

            if (isNewAgent) {
              currentAgent = chunkAgent;
            }
            turnComplete = false;
          }
        }

        const delta = typedChunk?.choices?.[0]?.delta;
        if (delta?.content) {
          accumulatedContent += delta.content;
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            let existingIndex = -1;

            if (toolCallDelta.id) {
              existingIndex = accumulatedToolCalls.findIndex(
                tc => tc.id === toolCallDelta.id,
              );
            }

            if (existingIndex === -1 && toolCallDelta.function?.name) {
              accumulatedToolCalls.push({
                id: toolCallDelta.id || '',
                type: 'function',
                function: { name: toolCallDelta.function.name, arguments: '' },
              });
              existingIndex = accumulatedToolCalls.length - 1;
            }

            if (existingIndex !== -1) {
              if (toolCallDelta.id) {
                accumulatedToolCalls[existingIndex].id = toolCallDelta.id;
              }

              if (toolCallDelta.function?.arguments) {
                accumulatedToolCalls[existingIndex].function.arguments +=
                  toolCallDelta.function.arguments;
              }
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
        if (finishReason === 'stop') {
          turnComplete = true;
        }
      }

      finalizeCurrentMessage();

      if (messageTokenUsage) {
        const assistantIndex = currentMessageIndex;
        setChatHistory(prev => {
          const safePrev = prev || {};
          const currentSession = safePrev[chatKey];
          if (!currentSession) return safePrev;
          return {
            ...safePrev,
            [chatKey]: {
              ...currentSession,
              messageTokenUsage: {
                ...(currentSession.messageTokenUsage || {}),
                [assistantIndex]: messageTokenUsage,
              },
            },
          };
        });
      }

      if (pendingSystemMessages.length > 0) {
        updateChatMessages(prev => {
          const systemMsgs = pendingSystemMessages.map(content => ({
            role: 'system' as const,
            content,
          }));
          return [...prev, ...systemMsgs];
        });
        pendingSystemMessages.length = 0;
      }

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
        updateChatMessages(prev => {
          // Preserve previous turns, replace only current turn with complete message chain
          const beforeThisTurn = prev.slice(0, turnStartIndex);
          const converted: ExtendedChatMessage[] = [];

          completedQueryMessages.forEach(msg => {
            if (msg.role === 'system') {
              converted.push({
                role: 'system',
                content: msg.content || '',
              } as ExtendedChatMessage);
            } else if (msg.role === 'tool') {
              converted.push({
                role: 'tool',
                content: msg.content || '',
                tool_call_id:
                  (msg as { tool_call_id?: string }).tool_call_id || '',
              } as ExtendedChatMessage);
            } else if (msg.role === 'assistant') {
              const toolCalls = (
                msg as {
                  tool_calls?: Array<{
                    id: string;
                    type: string;
                    function: { name: string; arguments: string };
                  }>;
                }
              ).tool_calls;

              converted.push({
                role: 'assistant',
                content: msg.content || '',
                name: msg.name,
                tool_calls: toolCalls
                  ? toolCalls.map(tc => ({
                      id: tc.id,
                      type: 'function' as const,
                      function: tc.function,
                    }))
                  : undefined,
              } as ExtendedChatMessage);
            }
          });

          const updated = [...beforeThisTurn, ...converted];
          return updated;
        });
      }
    },
    [
      buildChatMessages,
      chatKey,
      chatMessages,
      conversationId,
      name,
      queryTimeout,
      sessionId,
      setChatHistory,
      type,
      updateChatMessages,
      updateConversationId,
      updateTokenUsage,
    ],
  );

  const handlePollChatResponse = useCallback(
    async (userMessage: string) => {
      const messageArray = buildChatMessages(chatMessages, userMessage);

      const query = await chatService.submitChatQuery(
        userMessage,
        type,
        name,
        sessionId,
        conversationId,
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
            const fullQuery = await chatService.getQuery(query.name);
            const queryConversationId = (
              fullQuery?.status as { conversationId?: string } | undefined
            )?.conversationId;
            if (queryConversationId) {
              updateConversationId(queryConversationId);
            }

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
    const newSessionId = createNewSessionId(name);
    pendingSessionIdRef.current = newSessionId;
    setLastConversationId(newSessionId);
    setChatHistory(prev => ({
      ...(prev || {}),
      [chatKey]: {
        messages: [],
        sessionId: newSessionId,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        messageTokenUsage: {},
      },
    }));
    setError(null);
  }, [chatKey, name, setChatHistory, setLastConversationId]);

  return {
    messages: chatMessages,
    sessionId,
    isProcessing,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
    tokenUsage: chatSession.tokenUsage,
    messageTokenUsage: chatSession.messageTokenUsage,
  };
}
