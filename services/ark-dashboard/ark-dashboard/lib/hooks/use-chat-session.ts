'use client';

import { useAtom, useAtomValue, useStore } from 'jotai';
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
  type ParameterRow,
  type TeamAgentParameters,
  useAgentQueryParameters,
} from '@/lib/hooks/use-agent-query-parameters';
import { useBrokerFallbackNotice } from '@/lib/hooks/use-broker-fallback-notice';
import {
  type PendingApprovalQuery,
  useResumePendingApproval,
} from '@/lib/hooks/use-resume-pending-approval';
import { useResumeRunningQuery } from '@/lib/hooks/use-resume-running-query';
import { useStickyScroll } from '@/lib/hooks/use-sticky-scroll';
import { chatService } from '@/lib/services';
import {
  type BrokerUnavailableError,
  type ChatResponse,
  type MemoryNotice,
  type MemoryNoticeLookup,
  isBrokerUnavailableError,
} from '@/lib/services/chat';
import { useInvalidateQueriesList } from '@/lib/services/queries-hooks';
import type {
  ArkExtendedChunk,
  ExtendedChatMessage,
} from '@/lib/types/chat-message';
import {
  type StreamTurnEffects,
  createStreamTurnState,
  finishStreamTurn,
  processStreamChunk,
} from '@/lib/utils/chat-stream-turn';
import {
  buildCascadingApprovalMessage,
  buildPollResultMessages,
  convertResultMessage,
  stripEmptyAssistantPlaceholder,
} from '@/lib/utils/chat-turn';
import { useNamespace } from '@/providers/NamespaceProvider';

const STREAM_TERMINAL_STOP_GRACE_MS = 300;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function toSendErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Failed to send message';
  }
  if (err.message.includes('Failed to fetch')) {
    return 'Unable to connect to the ARK API. Please ensure the backend service is running on port 8000.';
  }
  return err.message;
}

async function* streamUntilForceClose<T>(
  source: AsyncIterable<T>,
  wasForceClosed: () => boolean,
  onExit: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    while (true) {
      let result: IteratorResult<T>;
      try {
        result = await iterator.next();
      } catch (err) {
        if (wasForceClosed()) return;
        throw err;
      }
      if (result.done) return;
      yield result.value;
    }
  } finally {
    onExit();
    try {
      await iterator.return?.();
    } catch {
      // Best-effort transport release; the stream may already be gone.
    }
  }
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
  statusText?: string;
  isWaitingForApprovalResponse: boolean;

  error: string | null;
  memoryNotice: MemoryNotice | null;
  brokerFallbackNoticeVisible: boolean;
  dismissBrokerFallbackNotice: () => void;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  tokenUsage?: TokenUsage;
  messageTokenUsage?: Record<number, TokenUsage>;
  cancelQuery: () => void;
  pollAfterApproval: () => Promise<void>;
  parameterVariant: 'agent' | 'team';
  hasParameters: boolean;
  availableParameters: string[];
  teamAgents: TeamAgentParameters[];
  parameterRows: ParameterRow[];
  addParameterRow: () => void;
  setParameterRowName: (id: string, name: string) => void;
  setParameterRowValue: (id: string, value: string) => void;
  setParameterRowAgent: (id: string, agent: string) => void;
  removeParameterRow: (id: string) => void;
  canAddParameterRow: boolean;
  missingParameters: string[];
  engineToolWarning: string | null;
}

export function useChatSession({
  name,
  type,
}: UseChatSessionParams): UseChatSessionReturn {
  const { namespace } = useNamespace();
  const invalidateQueriesList = useInvalidateQueriesList();
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const store = useStore();
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
  const activeQueryName = (chatSession as { activeQueryName?: string })
    .activeQueryName;

  const conversationIdRef = useRef<string | undefined>(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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
          cached_tokens: 0,
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
              cached_tokens: currentUsage.cached_tokens + usage.cached_tokens,
            },
          },
        };
      });
    },
    [chatKey, setChatHistory],
  );

  const updateMessageTokenUsage = useCallback(
    (messageIndex: number, usage: TokenUsage) => {
      setChatHistory(prev => {
        const currentSession = prev[chatKey];
        if (!currentSession) return prev;
        return {
          ...prev,
          [chatKey]: {
            ...currentSession,
            messageTokenUsage: {
              ...currentSession.messageTokenUsage,
              [messageIndex]: usage,
            },
          },
        };
      });
    },
    [chatKey, setChatHistory],
  );

  const lastQueryName = useRef('');

  const setActiveQueryName = useCallback(
    (queryName: string | undefined) => {
      setChatHistory(prev => {
        const currentSession = prev[chatKey];
        if (!currentSession) return prev;
        return {
          ...prev,
          [chatKey]: { ...currentSession, activeQueryName: queryName },
        };
      });
    },
    [chatKey, setChatHistory],
  );

  const clearActiveQuery = useCallback(
    () => setActiveQueryName(undefined),
    [setActiveQueryName],
  );

  const getMessages = useCallback(
    () => store.get(chatHistoryAtom)[chatKey]?.messages ?? [],
    [chatKey, store],
  );

  const updateConversationId = useCallback(
    (newConversationId: string) => {
      conversationIdRef.current = newConversationId;
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

  const ensureConversationId = useCallback(async () => {
    if (conversationIdRef.current) return;
    const queryName = lastQueryName.current;
    if (!queryName) return;
    try {
      const fullQuery = await chatService.getQuery(namespace, queryName);
      const fallbackConversationId = (
        fullQuery?.status as { conversationId?: string } | undefined
      )?.conversationId;
      if (fallbackConversationId) {
        updateConversationId(fallbackConversationId);
      }
    } catch (err) {
      console.error('Failed to fetch conversationId fallback:', err);
    }
  }, [namespace, updateConversationId]);

  const syncConversationId = useCallback(
    async (queryName: string) => {
      const fullQuery = await chatService.getQuery(namespace, queryName);
      const queryConversationId = (
        fullQuery?.status as { conversationId?: string } | undefined
      )?.conversationId;
      if (queryConversationId) {
        updateConversationId(queryConversationId);
      }
    },
    [namespace, updateConversationId],
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<string | undefined>();
  const [statusText, setStatusText] = useState<string | undefined>();
  const [isWaitingForApprovalResponse, setIsWaitingForApprovalResponse] =
    useState(false);

  const [error, setError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<MemoryNotice | null>(null);
  const brokerFallbackNotice = useBrokerFallbackNotice();
  const notifyBrokerFallback = brokerFallbackNotice.notify;
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const queryTimeout = useAtomValue(queryTimeoutSettingAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const {
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    resumeAutoScroll,
  } = useStickyScroll();
  const chatStreamAbortControllerRef = useRef(new AbortController());
  const leavingRef = useRef(false);

  const {
    variant: parameterVariant,
    hasParameters,
    availableParameters,
    teamAgents,
    rows: parameterRows,
    addRow: addParameterRow,
    setRowName: setParameterRowName,
    setRowValue: setParameterRowValue,
    setRowAgent: setParameterRowAgent,
    removeRow: removeParameterRow,
    canAddRow: canAddParameterRow,
    missingParameters,
    toApiParameters,
    engineToolWarning,
  } = useAgentQueryParameters(name, type);

  useEffect(() => {
    leavingRef.current = false;
    const leave = () => {
      leavingRef.current = true;
      chatStreamAbortControllerRef.current.abort();
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
    globalThis.addEventListener('pagehide', leave);
    return () => {
      globalThis.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  // Bumped by anything that makes an outstanding notice irrelevant, and
  // snapshotted at the start of each turn. `lastQueryName` alone is not enough:
  // it still holds the finished query's name after a target switch or a New
  // chat, and a late result would write the notice straight back. Snapshotting
  // at the start of the turn rather than at the lookup covers a switch that
  // happens while the turn is still running, which is most of the window.
  const noticeEpochRef = useRef(0);
  const turnEpochRef = useRef(0);

  const discardMemoryNotice = useCallback(() => {
    noticeEpochRef.current += 1;
    setMemoryNotice(null);
  }, []);

  const beginMemoryNoticeTurn = useCallback(() => {
    turnEpochRef.current = noticeEpochRef.current;
  }, []);

  const applyMemoryLookup = useCallback(
    (lookup: MemoryNoticeLookup | undefined, queryName: string) => {
      // No unmount guard: React 19 makes a state update on an unmounted
      // component a no-op, and a guard nothing can observe is a guard nothing
      // can test.
      if (
        !lookup?.settled ||
        noticeEpochRef.current !== turnEpochRef.current ||
        lastQueryName.current !== queryName
      ) {
        return;
      }
      setMemoryNotice(lookup.notice);
    },
    [],
  );

  // The notice describes the last turn of one conversation; switching target
  // must not carry it over to the next one.
  useEffect(() => {
    discardMemoryNotice();
  }, [chatKey, discardMemoryNotice]);

  // Deliberately not awaited: the stream has already delivered the answer, and
  // the controller writes the memory conditions a beat later, so blocking the
  // turn on that write would only keep the composer disabled for no reason.
  const refreshMemoryNotice = useCallback(
    (queryName: string) => {
      if (!queryName) {
        return;
      }
      void (async () => {
        try {
          applyMemoryLookup(
            await chatService.resolveMemoryNotice(namespace, queryName),
            queryName,
          );
        } catch {
          // Best effort. The turn already produced an answer, so a failed
          // lookup must not turn it into a chat error.
        }
      })();
    },
    [applyMemoryLookup, namespace],
  );

  useEffect(() => {
    const id = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(id);
  }, [chatMessages, scrollToBottom]);

  const pendingApprovalQueryRef = useRef<PendingApprovalQuery | null>(null);

  const handleStreamChatResponse = useCallback(
    async (
      userMessage: string,
      apiParameters?: ApiQueryParameter[],
    ): Promise<boolean> => {
      chatStreamAbortControllerRef.current = new AbortController();

      const turnStartIndex = chatMessages.length + 1;

      updateChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: '' } as ExtendedChatMessage,
      ]);

      const { queryName: streamQueryName, chunks } =
        await chatService.startStreamChatResponse(
          namespace,
          userMessage,
          type,
          name,
          sessionId,
          conversationId,
          queryTimeout,
          chatStreamAbortControllerRef.current.signal,
          apiParameters,
        );

      lastQueryName.current = streamQueryName;
      setActiveQueryName(streamQueryName);
      invalidateQueriesList();

      const turn = createStreamTurnState(streamQueryName, turnStartIndex);
      const effects: StreamTurnEffects = {
        updateChatMessages,
        setStatusText,
        updateConversationId,
        updateTokenUsage,
        setMessageTokenUsage: updateMessageTokenUsage,
        onApprovalRequest: (queryName, messageIndex) => {
          pendingApprovalQueryRef.current = { queryName, messageIndex };
        },
        onQueryNameChange: queryName => {
          lastQueryName.current = queryName;
        },
      };

      const streamAbortController = chatStreamAbortControllerRef.current;
      let forceClosePhase: string | undefined;
      let forceCloseTimer: ReturnType<typeof setTimeout> | undefined;

      const stopPhasePolling = await chatService.streamQueryStatus(
        namespace,
        streamQueryName,
        status => {
          if (status && typeof status === 'object' && 'phase' in status) {
            const phase = (status as { phase?: string }).phase;
            setProcessingPhase(phase);
          }
        },
        undefined,
        phase => {
          if (phase !== 'done' && phase !== 'error' && phase !== 'canceled') {
            return;
          }
          forceCloseTimer ??= setTimeout(() => {
            forceClosePhase = phase;
            streamAbortController.abort();
          }, STREAM_TERMINAL_STOP_GRACE_MS);
        },
      );

      for await (const chunk of streamUntilForceClose(
        chunks,
        () => forceClosePhase !== undefined,
        () => {
          stopPhasePolling();
          if (forceCloseTimer) clearTimeout(forceCloseTimer);
        },
      )) {
        const typedChunk = chunk as unknown as ArkExtendedChunk;
        if (processStreamChunk(turn, typedChunk, effects) === 'stop') break;
      }

      if (turn.brokerUnavailableError) {
        throw turn.brokerUnavailableError;
      }

      if (forceClosePhase === 'error' && !turn.hasError) {
        turn.hasError = true;
        turn.errorMessage = turn.errorMessage || 'Query failed';
      }
      if (forceClosePhase) {
        trackEvent({
          name: 'chat_stream_force_closed',
          properties: {
            targetType: type,
            targetName: name,
            queryName: turn.queryName,
          },
        });
      }

      return finishStreamTurn(turn, effects);
    },
    [
      chatMessages,
      conversationId,
      invalidateQueriesList,
      name,
      namespace,
      queryTimeout,
      sessionId,
      setActiveQueryName,
      type,
      updateChatMessages,
      updateConversationId,
      updateMessageTokenUsage,
      updateTokenUsage,
    ],
  );

  const handlePollChatResponse = useCallback(
    async (
      userMessage: string,
      apiParameters?: ApiQueryParameter[],
      existingQueryName?: string,
    ): Promise<boolean> => {
      let queryName = existingQueryName;
      if (!queryName) {
        const query = await chatService.submitChatQuery(
          namespace,
          userMessage,
          type,
          name,
          sessionId,
          conversationId,
          queryTimeout,
          apiParameters,
        );
        queryName = query.name;
        invalidateQueriesList();
      }

      lastQueryName.current = queryName;
      setActiveQueryName(queryName);

      let pollingStopped = false;
      stopPollingRef.current = () => {
        pollingStopped = true;
      };

      while (!pollingStopped) {
        try {
          const result = await chatService.getQueryResult(namespace, queryName);
          if (leavingRef.current) return false;

          setProcessingPhase(result.status);

          if (result.terminal) {
            applyMemoryLookup(result.memoryLookup, queryName);
            await syncConversationId(queryName);

            const resultMessages = buildPollResultMessages(result, queryName);
            if (resultMessages.length > 0) {
              updateChatMessages(prev => [...prev, ...resultMessages]);
            }
            return !result.transportError;
          }
        } catch (err) {
          console.error('Error polling query status:', err);
          if (!leavingRef.current) {
            updateChatMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: 'Error while processing query',
                metadata: {
                  status: 'failed',
                  queryName,
                },
              } as ExtendedChatMessage,
            ]);
          }
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return false;
    },
    [
      applyMemoryLookup,
      conversationId,
      invalidateQueriesList,
      name,
      namespace,
      queryTimeout,
      sessionId,
      setActiveQueryName,
      syncConversationId,
      type,
      updateChatMessages,
    ],
  );

  const appendFailedMessage = useCallback(
    (content: string) => {
      updateChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content,
          metadata: {
            status: 'failed',
          },
        } as ExtendedChatMessage,
      ]);
      setError(content);
    },
    [updateChatMessages],
  );

  const recoverViaPolling = useCallback(
    async (
      err: BrokerUnavailableError,
      userMessage: string,
      apiParameters: ApiQueryParameter[] | undefined,
    ): Promise<boolean> => {
      if (err.code === 'broker_unavailable') {
        notifyBrokerFallback();
      }
      updateChatMessages(stripEmptyAssistantPlaceholder);
      try {
        return await handlePollChatResponse(
          userMessage,
          apiParameters,
          err.queryName || lastQueryName.current || undefined,
        );
      } catch (error_) {
        console.error('Error sending message:', error_);
        appendFailedMessage(
          error_ instanceof Error ? error_.message : 'Failed to send message',
        );
        return false;
      }
    },
    [
      appendFailedMessage,
      handlePollChatResponse,
      notifyBrokerFallback,
      updateChatMessages,
    ],
  );

  const sendMessage = useCallback(
    async (userMessage: string) => {
      setError(null);
      resumeAutoScroll();

      if (missingParameters.length > 0) {
        return;
      }

      const apiParameters = toApiParameters();
      clearActiveQuery();

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
      beginMemoryNoticeTurn();

      let aborted = false;
      let settled = false;

      try {
        if (isChatStreamingEnabled) {
          settled = !(await handleStreamChatResponse(
            userMessage,
            apiParameters,
          ));
          await ensureConversationId();
        } else {
          settled = await handlePollChatResponse(userMessage, apiParameters);
        }
      } catch (err) {
        console.error('Error sending message:', err);

        if (leavingRef.current || isAbortError(err)) {
          aborted = true;
          return;
        }

        if (isBrokerUnavailableError(err)) {
          settled = await recoverViaPolling(err, userMessage, apiParameters);
          return;
        }

        appendFailedMessage(toSendErrorMessage(err));
      } finally {
        setIsProcessing(false);
        setProcessingPhase(undefined);
        setStatusText(undefined);
        if (!leavingRef.current && settled) {
          clearActiveQuery();
        }

        // In `finally`, not after the stream, because the failure path is the
        // one that matters most: ark-api resolves the chunk stream's broker
        // from the Memory resource, so a memory fault severe enough to set
        // either condition also 503s the stream. Running the lookup only on
        // success meant the default configuration showed a broker error and
        // never the notice — for exactly the faults the notice reports. The
        // stream breaking does not cancel the query, so it still finishes and
        // records its verdict for this lookup to read.
        // Not on a turn that paused for tool approval: handleStreamChatResponse
        // returns normally when it sees an approval request, but the query has
        // not dispatched yet, so the poll is guaranteed to find no verdict and
        // just burns its budget. pollAfterApproval reads the verdict off the
        // terminal response once the user answers.
        if (
          isChatStreamingEnabled &&
          !aborted &&
          !pendingApprovalQueryRef.current
        ) {
          refreshMemoryNotice(lastQueryName.current);
        }
      }
    },
    [
      appendFailedMessage,
      beginMemoryNoticeTurn,
      clearActiveQuery,
      ensureConversationId,
      handlePollChatResponse,
      handleStreamChatResponse,
      isChatStreamingEnabled,
      missingParameters,
      name,
      recoverViaPolling,
      refreshMemoryNotice,
      resumeAutoScroll,
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
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          cached_tokens: 0,
        },
        messageTokenUsage: {},
      },
    }));
    setError(null);
    discardMemoryNotice();
  }, [
    chatKey,
    discardMemoryNotice,
    name,
    setChatHistory,
    setLastConversationId,
  ]);

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

    clearActiveQuery();

    await chatService
      .cancelQuery(namespace, lastQueryName.current)
      .catch(() => {});
  }, [clearActiveQuery, namespace, setIsProcessing, updateChatMessages]);

  const handleCascadingApproval = useCallback(
    async (queryName: string): Promise<boolean> => {
      const query = await chatService.getQuery(namespace, queryName);
      const status = query?.status as
        | { response?: { a2a?: { taskId?: string } } }
        | undefined;
      const taskId = status?.response?.a2a?.taskId;
      if (!taskId) return false;

      try {
        const a2aTask = await chatService.getA2ATask(
          namespace,
          `a2a-task-${taskId}`,
        );
        const message = buildCascadingApprovalMessage(
          a2aTask,
          queryName,
          query?.namespace || namespace,
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
    [namespace, updateChatMessages, setIsProcessing],
  );

  const applyTerminalResult = useCallback(
    (result: ChatResponse, messageIndex: number, queryName: string): void => {
      stopPollingRef.current = null;
      applyMemoryLookup(result.memoryLookup, queryName);

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

      clearActiveQuery();
      setIsProcessing(false);
    },
    [updateChatMessages, setIsProcessing, applyMemoryLookup, clearActiveQuery],
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
        const result = await chatService.getQueryResult(namespace, queryName);

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
    namespace,
    updateChatMessages,
    setIsProcessing,
    handleCascadingApproval,
    applyTerminalResult,
  ]);

  const restorePendingApproval = useResumePendingApproval({
    namespace,
    getMessages,
    updateChatMessages,
    pendingApprovalQueryRef,
  });

  const onResume = useCallback((queryName: string, stop: () => void) => {
    lastQueryName.current = queryName;
    stopPollingRef.current = stop;
  }, []);

  useResumeRunningQuery({
    namespace,
    chatKey,
    activeQueryName,
    isProcessing,
    setIsProcessing,
    setProcessingPhase,
    updateChatMessages,
    clearActiveQuery,
    onResume,
    restorePendingApproval,
  });

  return {
    messages: chatMessages,
    sessionId,
    isWaitingForApprovalResponse,
    isProcessing,
    processingPhase,
    statusText,
    error,
    memoryNotice,
    brokerFallbackNoticeVisible: brokerFallbackNotice.visible,
    dismissBrokerFallbackNotice: brokerFallbackNotice.dismiss,
    sendMessage,
    clearChat,
    messagesEndRef,
    scrollContainerRef,
    handleScroll,
    tokenUsage: chatSession.tokenUsage,
    messageTokenUsage: chatSession.messageTokenUsage,
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
    engineToolWarning,
  };
}
