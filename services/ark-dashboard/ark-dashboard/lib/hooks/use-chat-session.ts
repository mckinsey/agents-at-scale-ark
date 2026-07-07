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
import {
  type ApiQueryParameter,
  useAgentQueryParameters,
} from '@/lib/hooks/use-agent-query-parameters';
import { chatService } from '@/lib/services';
import type { ChatResponse } from '@/lib/services/chat';
import type {
  ArkExtendedChunk,
  ExtendedChatMessage,
} from '@/lib/types/chat-message';

type ResultMessage = NonNullable<ChatResponse['messages']>[number];

// Converts a query-result message (OpenAI-ish shape) into the dashboard's
// ExtendedChatMessage. Extracted to keep pollAfterApproval's complexity low.
function convertResultMessage(msg: ResultMessage): ExtendedChatMessage {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: msg.content || '',
      tool_call_id: msg.tool_call_id || '',
    } as ExtendedChatMessage;
  }
  if (msg.role === 'assistant') {
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
      role: 'assistant',
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
  }
  return {
    role: msg.role as 'user' | 'system',
    content: msg.content || '',
  } as ExtendedChatMessage;
}

// Builds the chat message that surfaces a cascading approval request from an
// A2ATask, or null when the task carries no tool calls to approve.
function buildCascadingApprovalMessage(
  a2aTask: Awaited<ReturnType<typeof chatService.getA2ATask>>,
  queryName: string,
  queryNamespace: string,
  taskId: string,
): ExtendedChatMessage | null {
  const meta = a2aTask?.status?.protocolMetadata;
  if (!meta?.toolCalls) return null;

  const taskStartTime = a2aTask?.status?.startTime;
  const receivedAtMs = taskStartTime
    ? new Date(taskStartTime).getTime()
    : Date.now();

  return {
    role: 'assistant',
    content: '',
    approvalRequest: {
      type: 'tool_approval_request',
      taskId,
      queryName,
      queryNamespace,
      toolCalls: JSON.parse(meta.toolCalls),
      timeout: meta.timeout,
      onTimeout: meta.onTimeout,
      agentName: a2aTask?.agentRef?.name,
      receivedAtMs,
    },
    metadata: {
      queryName,
    },
  } as ExtendedChatMessage;
}

interface UseChatSessionParams {
  name: string;
  type: ChatType;
}

interface UseChatSessionReturn {
  messages: ExtendedChatMessage[];
  sessionId: string;
  isProcessing: boolean;
  processingPhase?: string;
  isWaitingForApprovalResponse: boolean;

  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  tokenUsage?: TokenUsage;
  messageTokenUsage?: Record<number, TokenUsage>;
  cancelQuery: () => void;
  pollAfterApproval: () => Promise<void>;
  requiredParameters: string[];
  parameterValues: Record<string, string>;
  setParameterValue: (name: string, value: string) => void;
  missingParameters: string[];
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
  const conversationId = (chatSession as { conversationId?: string })
    .conversationId;

  useEffect(() => {
    if (!chatHistory?.[chatKey]) {
      const sessionIdToUse =
        pendingSessionIdRef.current ?? createNewSessionId(name);
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
  const [processingPhase, setProcessingPhase] = useState<string | undefined>();
  const [isWaitingForApprovalResponse, setIsWaitingForApprovalResponse] =
    useState(false);

  const [error, setError] = useState<string | null>(null);
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const queryTimeout = useAtomValue(queryTimeoutSettingAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatStreamAbortControllerRef = useRef(new AbortController());

  const {
    requiredParameters,
    values: parameterValues,
    setValue: setParameterValue,
    missingParameters,
    toApiParameters,
  } = useAgentQueryParameters(name, type);

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

  const lastQueryName = useRef('');
  const pendingApprovalQueryRef = useRef<{
    queryName: string;
    messageIndex: number;
  } | null>(null);

  const handleStreamChatResponse = useCallback(
    async (userMessage: string, apiParameters?: ApiQueryParameter[]) => {
      chatStreamAbortControllerRef.current = new AbortController();

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
      let hasPendingApproval = false;

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

      const { queryName: streamQueryName, chunks } =
        await chatService.startStreamChatResponse(
          userMessage,
          type,
          name,
          sessionId,
          conversationId,
          queryTimeout,
          chatStreamAbortControllerRef.current.signal,
          apiParameters,
        );

      queryName = streamQueryName;
      lastQueryName.current = queryName;

      const stopPhasePolling = await chatService.streamQueryStatus(
        streamQueryName,
        status => {
          if (status && typeof status === 'object' && 'phase' in status) {
            const phase = (status as { phase?: string }).phase;
            setProcessingPhase(phase);
          }
        },
      );

      for await (const chunk of chunks) {
        const typedChunk = chunk as unknown as ArkExtendedChunk;

        console.log(
          '[HITL Debug] Received chunk:',
          JSON.stringify(chunk).slice(0, 200),
        );

        if (
          'type' in typedChunk &&
          typedChunk.type === 'tool_approval_request'
        ) {
          console.log(
            '[HITL Debug] Detected tool_approval_request event!',
            typedChunk,
          );
          const approvalRequest: import('@/lib/types/chat-message').ToolApprovalRequest =
            {
              ...(typedChunk as unknown as import('@/lib/types/chat-message').ToolApprovalRequest),
              receivedAtMs: Date.now(),
            };
          hasPendingApproval = true;

          pendingApprovalQueryRef.current = {
            queryName,
            messageIndex: currentMessageIndex,
          };
          console.log(
            '[HITL Debug] Stored pending approval query info:',
            pendingApprovalQueryRef.current,
          );

          updateChatMessages(prev => {
            console.log(
              '[HITL Debug] updateChatMessages called, prev messages:',
              prev.length,
            );
            const updated = [...prev];
            updated[currentMessageIndex] = {
              role: 'assistant',
              content: '',
              approvalRequest,
              metadata: {
                queryName,
              },
            } as ExtendedChatMessage;
            console.log(
              '[HITL Debug] Message at index',
              currentMessageIndex,
              'updated with approval:',
              updated[currentMessageIndex],
            );
            return updated;
          });

          console.log(
            '[HITL Debug] Updated message with approval request at index:',
            currentMessageIndex,
          );
          console.log('[HITL Debug] Continuing to next chunk...');
          continue;
        }

        console.log(
          '[HITL Debug] Processing regular chunk (not approval request)',
        );

        if ('error' in typedChunk && typedChunk.error) {
          hasError = true;
          errorMessage = typedChunk.error.message || 'An error occurred';
          queryName = typedChunk.ark?.query || '';
          lastQueryName.current = queryName;
          break;
        }

        if (
          'id' in typedChunk &&
          typedChunk.id === 'chatcmpl-final' &&
          'ark' in typedChunk &&
          typedChunk.ark
        ) {
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

          const arkTokenUsage = arkData.completedQuery?.status?.tokenUsage;
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

        if ('ark' in typedChunk && typedChunk.ark) {
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

        const delta =
          'choices' in typedChunk ? typedChunk?.choices?.[0]?.delta : undefined;
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

        const finishReason =
          'choices' in typedChunk
            ? typedChunk?.choices?.[0]?.finish_reason
            : undefined;
        if (finishReason === 'stop') {
          turnComplete = true;
        }
      }

      stopPhasePolling();

      if (!hasPendingApproval) {
        console.log(
          '[HITL Debug] Finalizing current message (no pending approval)',
        );
        finalizeCurrentMessage();
      } else {
        console.log(
          '[HITL Debug] Skipping finalize because we have a pending approval',
        );
      }

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

      console.log('[HITL Debug] Stream processing completed', {
        hasPendingApproval,
        queryName,
      });
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
    async (userMessage: string, apiParameters?: ApiQueryParameter[]) => {
      const messageArray = buildChatMessages(chatMessages, userMessage);

      const query = await chatService.submitChatQuery(
        userMessage,
        type,
        name,
        sessionId,
        conversationId,
        undefined,
        queryTimeout,
        apiParameters,
      );

      lastQueryName.current = query.name;

      let pollingStopped = false;
      stopPollingRef.current = () => {
        pollingStopped = true;
      };

      while (!pollingStopped) {
        try {
          const result = await chatService.getQueryResult(query.name);

          setProcessingPhase(result.status);

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

      if (missingParameters.length > 0) {
        const plural = missingParameters.length > 1;
        setError(
          `This agent needs the ${missingParameters.join(', ')} parameter${
            plural ? 's' : ''
          } — supply ${plural ? 'them' : 'it'} above, or use the Queries form to create the query.`,
        );
        return;
      }

      const apiParameters = toApiParameters();

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
          await handleStreamChatResponse(userMessage, apiParameters);
        } else {
          await handlePollChatResponse(userMessage, apiParameters);
        }
      } catch (err) {
        console.error('Error sending message:', err);
        let errMsg = 'Failed to send message';

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            return;
          }
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
        setProcessingPhase(undefined);
      }
    },
    [
      handlePollChatResponse,
      handleStreamChatResponse,
      isChatStreamingEnabled,
      missingParameters,
      name,
      toApiParameters,
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

  const cancelQuery = useCallback(async () => {
    chatStreamAbortControllerRef.current.abort();
    stopPollingRef.current?.();

    setIsProcessing(false);

    updateChatMessages(prev => [
      ...prev,
      {
        role: 'system',
        content: 'Conversation stopped by user',
      },
    ]);

    await chatService.cancelQuery(lastQueryName.current).catch(() => {});
  }, [setIsProcessing, updateChatMessages]);

  const handleCascadingApproval = useCallback(
    async (queryName: string): Promise<boolean> => {
      const query = await chatService.getQuery(queryName);
      const status = query?.status as
        | { response?: { a2a?: { taskId?: string } } }
        | undefined;
      const taskId = status?.response?.a2a?.taskId;
      if (!taskId) return false;

      try {
        const a2aTask = await chatService.getA2ATask(`a2a-task-${taskId}`);
        const message = buildCascadingApprovalMessage(
          a2aTask,
          queryName,
          query?.namespace || 'default',
          taskId,
        );
        if (!message) return false;

        updateChatMessages(prev => [...prev, message]);
        pendingApprovalQueryRef.current = { queryName, messageIndex: -1 };
        stopPollingRef.current = null;
        setIsProcessing(false);
        return true;
      } catch (err) {
        console.error(
          '[HITL Debug] Error fetching cascading approval task:',
          err,
        );
        return false;
      }
    },
    [updateChatMessages, setIsProcessing],
  );

  const applyTerminalResult = useCallback(
    (result: ChatResponse, messageIndex: number, queryName: string): void => {
      stopPollingRef.current = null;

      if (result.status === 'done') {
        if (result.messages && result.messages.length > 0) {
          updateChatMessages(prev => [
            ...prev.slice(0, messageIndex),
            ...result.messages!.map(convertResultMessage),
          ]);
        }
      } else if (result.status === 'error') {
        updateChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: result.response || 'Query failed after approval',
            metadata: {
              status: 'failed',
              queryName,
            },
          } as ExtendedChatMessage,
        ]);
      }

      setIsProcessing(false);
    },
    [updateChatMessages, setIsProcessing],
  );

  const pollAfterApproval = useCallback(async () => {
    if (!pendingApprovalQueryRef.current) return;

    const { queryName, messageIndex } = pendingApprovalQueryRef.current;
    setIsWaitingForApprovalResponse(true);

    let pollingStopped = false;
    stopPollingRef.current = () => {
      pollingStopped = true;
    };

    const startTime = Date.now();
    const timeoutMs = 120000;

    while (!pollingStopped) {
      if (Date.now() - startTime > timeoutMs) {
        updateChatMessages(prev => [
          ...prev,
          {
            role: 'system',
            content: 'Query timed out waiting for response after approval',
          } as ExtendedChatMessage,
        ]);
        setIsProcessing(false);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        const result = await chatService.getQueryResult(queryName);

        if (
          result.status === 'input-required' &&
          (await handleCascadingApproval(queryName))
        ) {
          break;
        }

        if (result.terminal) {
          applyTerminalResult(result, messageIndex, queryName);
          break;
        }
      } catch (err) {
        console.error('[HITL Debug] Error polling after approval:', err);
      }
    }

    setIsWaitingForApprovalResponse(false);
  }, [
    updateChatMessages,
    setIsProcessing,
    handleCascadingApproval,
    applyTerminalResult,
  ]);

  return {
    messages: chatMessages,
    sessionId,
    isWaitingForApprovalResponse,
    isProcessing,
    processingPhase,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
    tokenUsage: chatSession.tokenUsage,
    messageTokenUsage: chatSession.messageTokenUsage,
    cancelQuery,
    pollAfterApproval,
    requiredParameters,
    parameterValues,
    setParameterValue,
    missingParameters,
  };
}
