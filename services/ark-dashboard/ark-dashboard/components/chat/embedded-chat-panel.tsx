'use client';

import { useAtom, useAtomValue } from 'jotai';
import {
  AlertCircle,
  Bug,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  RotateCcw,
  Send,
} from 'lucide-react';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { chatHistoryAtom, createNewSessionId } from '@/atoms/chat-history';
import { isChatStreamingEnabledAtom } from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trackEvent } from '@/lib/analytics/singleton';
import { hashPromptSync } from '@/lib/analytics/utils';
import { chatService } from '@/lib/services';

type ChatType = 'model' | 'team' | 'agent';
type TabType = 'chat' | 'debug';
type DebugStreamType = 'traces' | 'events';

interface StreamEntry {
  id: string;
  timestamp: string;
  data: unknown;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
}

const PAGE_SIZE = 100;

function extractItemTimestamp(item: unknown): string {
  if (!item) {
    return new Date().toISOString();
  }
  const typedItem = item as Record<string, unknown>;
  if (typedItem.timestamp) {
    return typedItem.timestamp as string;
  }
  let unixTimestamp = '';
  if (typedItem?.startTimeUnixNano) {
    unixTimestamp = typedItem.startTimeUnixNano as string;
  }
  const spans = typedItem?.spans as Array<Record<string, unknown>>;
  if (!unixTimestamp && spans && spans.length > 0) {
    unixTimestamp = spans[0].startTimeUnixNano as string;
  }
  if (unixTimestamp) {
    return new Date(parseInt(unixTimestamp.substring(0, 13))).toISOString();
  }
  return new Date().toISOString();
}

function useSSEStream(endpoint: string, memory: string, agentName: string) {
  const [streamedEntries, setStreamedEntries] = useState<StreamEntry[]>([]);
  const [fetchedEntries, setFetchedEntries] = useState<StreamEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextCursorRef = useRef<number | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialFetchDoneRef = useRef(false);
  const mountedRef = useRef(true);

  const filterByAgent = useCallback(
    (item: unknown): boolean => {
      if (!agentName) return true;
      const str = JSON.stringify(item);
      return str.toLowerCase().includes(agentName.toLowerCase());
    },
    [agentName],
  );

  const connect = useCallback(
    (cursor?: number) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      setError(null);
      let url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&watch=true`;
      if (cursor !== undefined && cursor !== null) {
        url += `&cursor=${cursor}`;
      }
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = event => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            setError(data.error.message || 'Stream error');
            return;
          }
          if (!filterByAgent(data)) return;
          const entry: StreamEntry = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            timestamp: extractItemTimestamp(data),
            data,
          };
          setStreamedEntries(prev => [entry, ...prev.slice(0, 499)]);
        } catch {
          console.error('Failed to parse SSE data:', event.data);
        }
      };

      eventSource.onerror = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        eventSource.close();
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect(nextCursorRef.current);
          }
        }, 3000);
      };
    },
    [endpoint, memory, filterByAgent],
  );

  const fetchPage = useCallback(
    async (cursor?: number) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      try {
        let url = `/api${endpoint}?memory=${encodeURIComponent(memory)}&limit=${PAGE_SIZE}`;
        if (cursor !== undefined && cursor !== null) {
          url += `&cursor=${cursor}`;
        }
        const response = await fetch(url, {
          signal: abortControllerRef.current.signal,
        });
        if (!mountedRef.current) return null;
        const data: PaginatedResponse<unknown> = await response.json();
        if ((data as unknown as { error?: { message?: string } }).error) {
          if (mountedRef.current) {
            setError(
              (data as unknown as { error: { message?: string } }).error
                .message || 'Fetch error',
            );
          }
          return null;
        }
        const newEntries: StreamEntry[] = data.items
          .filter(filterByAgent)
          .map((item, i) => ({
            id: `fetched-${cursor ?? 0}-${i}-${Math.random().toString(36).substring(2, 11)}`,
            timestamp: extractItemTimestamp(item),
            data: item,
          }));
        if (mountedRef.current) {
          setFetchedEntries(prev => [...prev, ...newEntries]);
          setHasMore(data.hasMore);
        }
        nextCursorRef.current = data.nextCursor;
        return data;
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && mountedRef.current) {
          setError('Failed to fetch data');
        }
        return null;
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [endpoint, memory, filterByAgent],
  );

  const loadMore = useCallback(() => {
    if (
      !isLoading &&
      hasMore &&
      nextCursorRef.current !== undefined &&
      nextCursorRef.current !== null
    ) {
      fetchPage(nextCursorRef.current);
    }
  }, [fetchPage, isLoading, hasMore]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const clear = useCallback(() => {
    setStreamedEntries([]);
    setFetchedEntries([]);
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    mountedRef.current = true;

    async function init() {
      const result = await fetchPage();
      if (mountedRef.current) {
        connect(result?.nextCursor);
      }
    }
    init();

    return () => {
      mountedRef.current = false;
      disconnect();
      abortControllerRef.current?.abort();
      initialFetchDoneRef.current = false;
    };
  }, [connect, disconnect, fetchPage]);

  const entries = [...streamedEntries, ...fetchedEntries];

  return { entries, isConnected, isLoading, hasMore, error, clear, loadMore };
}

interface DebugStreamViewProps {
  entries: StreamEntry[];
  isConnected: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  error: string | null;
  onLoadMore?: () => void;
}

function DebugStreamView({
  entries,
  isConnected,
  isLoading,
  hasMore,
  error,
  onLoadMore,
}: DebugStreamViewProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [entries, autoScroll]);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const extractSessionId = (data: unknown): string => {
    const item = data as Record<string, unknown>;

    // CASE: Trace - Try to extract session ID from spans
    if (item.spans && Array.isArray(item.spans) && item.spans.length > 0) {
      const span = item.spans[0] as Record<string, unknown>;
      if (span.attributes && Array.isArray(span.attributes)) {
        const sessionAttr = span.attributes.find(
          (attr: unknown) =>
            typeof attr === 'object' &&
            attr !== null &&
            'key' in attr &&
            attr.key === 'session.id',
        ) as { value?: string } | undefined;
        if (sessionAttr?.value) {
          return sessionAttr.value;
        }
      }
    }

    // CASE: Trace Span - Try to extract session ID from attributes
    if (item.attributes && Array.isArray(item.attributes)) {
      const sessionAttr = item.attributes.find(
        (attr: unknown) =>
          typeof attr === 'object' &&
          attr !== null &&
          'key' in attr &&
          attr.key === 'session.id',
      ) as { value?: string } | undefined;
      if (sessionAttr?.value) {
        return sessionAttr.value;
      }
    }

    // CASE: Event - Try to extract session ID from event data
    if (item.data && typeof item.data === 'object' && item.data !== null) {
      const eventData = item.data as Record<string, unknown>;
      if (eventData.sessionId && typeof eventData.sessionId === 'string') {
        return eventData.sessionId;
      }
    }

    return 'unknown';
  };

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, StreamEntry[]>();
    entries.forEach(entry => {
      const sessionId = extractSessionId(entry.data);
      if (!groups.has(sessionId)) {
        groups.set(sessionId, []);
      }
      groups.get(sessionId)!.push(entry);
    });
    return groups;
  }, [entries]);

  useEffect(() => {
    if (groupedEntries.size === 0) return;

    const sessionIds = Array.from(groupedEntries.keys());
    const latestSessionId = sessionIds.reduce((latest, current) => {
      const latestEntries = groupedEntries.get(latest)!;
      const currentEntries = groupedEntries.get(current)!;
      const latestTime = Math.max(
        ...latestEntries.map(e => new Date(e.timestamp).getTime()),
      );
      const currentTime = Math.max(
        ...currentEntries.map(e => new Date(e.timestamp).getTime()),
      );
      return currentTime > latestTime ? current : latest;
    }, sessionIds[0]);

    setExpandedSessions(prev => {
      if (prev.has(latestSessionId)) return prev;
      const next = new Set(prev);
      next.add(latestSessionId);
      return next;
    });
  }, [groupedEntries]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-muted-foreground text-xs">
            {entries.length} entries
          </span>
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Switch
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="scale-75"
          />
          Auto-scroll
        </label>
      </div>
      {error && (
        <div className="mx-2 mb-2 rounded bg-red-100 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="bg-muted/50 flex-1 overflow-y-auto p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            Waiting for data...
          </div>
        ) : (
          <>
            {Array.from(groupedEntries.entries()).map(
              ([sessionId, sessionEntries]) => {
                const isSessionExpanded = expandedSessions.has(sessionId);
                return (
                  <div key={sessionId} className="mb-2">
                    <div
                      className="bg-muted/80 mb-1 flex cursor-pointer items-center gap-1 rounded p-1 font-semibold"
                      onClick={() => toggleSessionExpanded(sessionId)}>
                      {isSessionExpanded ? (
                        <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                      )}
                      <span>Session: {sessionId}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {sessionEntries.length}{' '}
                        {sessionEntries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    {isSessionExpanded && (
                      <div className="ml-4">
                        {sessionEntries.map(entry => {
                          const isExpanded = expandedIds.has(entry.id);
                          return (
                            <div
                              key={entry.id}
                              className="border-border mb-1 overflow-hidden border-b pb-1 last:border-b-0">
                              <div className="flex min-w-0 items-center gap-1">
                                <span
                                  className="flex shrink-0 cursor-pointer items-center gap-1"
                                  onClick={() => toggleExpanded(entry.id)}>
                                  {isExpanded ? (
                                    <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                                  )}
                                  <span className="text-muted-foreground">
                                    {entry.timestamp}
                                  </span>
                                </span>
                                {!isExpanded && (
                                  <span className="text-muted-foreground w-0 flex-1 truncate">
                                    {JSON.stringify(entry.data)}
                                  </span>
                                )}
                              </div>
                              {isExpanded && (
                                <pre className="text-foreground mt-1 break-all whitespace-pre-wrap">
                                  {JSON.stringify(entry.data, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              },
            )}
            {onLoadMore && hasMore && (
              <div className="flex justify-center py-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  disabled={isLoading}>
                  {isLoading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface EmbeddedChatPanelProps {
  name: string;
  type: ChatType;
}

export function EmbeddedChatPanel({ name, type }: EmbeddedChatPanelProps) {
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

  const setChatMessages = useCallback(
    (
      updater:
        | ChatCompletionMessageParam[]
        | ((
            prev: ChatCompletionMessageParam[],
          ) => ChatCompletionMessageParam[]),
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
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [debugStreamType, setDebugStreamType] =
    useState<DebugStreamType>('traces');
  const [debugMode, setDebugMode] = useState(true);

  const traces = useSSEStream('/v1/broker/traces', 'default', name);
  const events = useSSEStream('/v1/broker/events', 'default', name);

  const handleNewChat = useCallback(() => {
    const newSessionId = createNewSessionId();
    initSessionIdRef.current = newSessionId;
    setLastConversationId(newSessionId);
    setChatHistory(prev => ({
      ...(prev || {}),
      [chatKey]: { messages: [], sessionId: newSessionId },
    }));
    setError(null);
  }, [chatKey, setChatHistory, setLastConversationId]);
  const inputRef = useRef<HTMLInputElement>(null);
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [chatMessages]);

  const buildChatMessages = (
    chatMsgs: ChatCompletionMessageParam[],
    currentMsg: string,
  ): ChatCompletionMessageParam[] => {
    return [...chatMsgs, { role: 'user', content: currentMsg }];
  };

  const handleStreamChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);
    const assistantMessageIndex = chatMessages.length + 1;
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let accumulatedContent = '';
    const accumulatedToolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for await (const chunk of chatService.streamChatResponse(
      messageArray,
      type,
      name,
      sessionId,
    )) {
      const typedChunk = chunk as unknown as ChatCompletionChunk;
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
      setChatMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          role: 'assistant',
          content: accumulatedContent,
          tool_calls: accumulatedToolCalls,
        };
        return updated;
      });
    }

    if (accumulatedToolCalls.length > 0) {
      setChatMessages(prev => {
        const newMessages = [...prev];
        accumulatedToolCalls.forEach(toolCall => {
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Called ${toolCall.function.name} with ${toolCall.function.arguments}`,
          });
        });
        return newMessages;
      });
    }
  };

  const handlePollChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);

    const query = await chatService.submitChatQuery(
      messageArray,
      type,
      name,
      sessionId,
    );

    let pollingStopped = false;
    stopPollingRef.current = () => {
      pollingStopped = true;
    };

    while (!pollingStopped) {
      try {
        const result = await chatService.getQueryResult(query.name);

        if (result.terminal) {
          let content = '';

          if (result.status === 'done' && result.response) {
            content = result.response;
          } else if (result.status === 'error') {
            content = result.response || 'Query failed';
          } else if (result.status === 'unknown') {
            content = 'Query status unknown';
          }

          setChatMessages(prev => [...prev, { role: 'assistant', content }]);
          pollingStopped = true;
          break;
        }
      } catch (err) {
        console.error('Error polling query status:', err);
        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Error while processing query' },
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

    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    inputRef.current?.focus();
    setIsProcessing(true);

    try {
      if (isChatStreamingEnabled) {
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

      setError(errorMessage);
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as TabType)}
        className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-4 py-3">
            <MessageCircle className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">Chat with {name}</span>
          </div>
          <TabsList className="mx-4 mb-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <Bug className="h-3.5 w-3.5" />
              Debug
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
            <div className="space-y-4">
              {error && (
                <div className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-md p-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {chatMessages.length === 0 && !error && (
                <div className="text-muted-foreground py-8 text-center">
                  Start a conversation with the {type}
                </div>
              )}

              {chatMessages.map((message, index) => {
                if (message.role === 'tool') {
                  return null;
                }

                let content = '';
                if (typeof message.content === 'string') {
                  content = message.content;
                } else if (Array.isArray(message.content)) {
                  content = message.content
                    .filter(
                      part =>
                        typeof part === 'object' &&
                        part !== null &&
                        'type' in part &&
                        part.type === 'text',
                    )
                    .map(part =>
                      typeof part === 'object' &&
                      part !== null &&
                      'text' in part
                        ? part.text
                        : '',
                    )
                    .join('\n');
                }

                const toolCalls =
                  'tool_calls' in message ? message.tool_calls : undefined;

                return (
                  <div key={index} className="contents">
                    {debugMode &&
                      toolCalls &&
                      toolCalls.map((toolCall, toolIndex) => (
                        <div
                          key={`${index}-tool-${toolIndex}`}
                          className={toolIndex > 0 ? 'mt-2' : ''}>
                          <ChatMessage
                            role="assistant"
                            content=""
                            viewMode="markdown"
                            toolCalls={[
                              toolCall as {
                                id: string;
                                type: 'function';
                                function: { name: string; arguments: string };
                              },
                            ]}
                          />
                        </div>
                      ))}
                    {content && (
                      <div className={toolCalls ? 'mt-2' : ''}>
                        <ChatMessage
                          role={message.role as 'user' | 'assistant' | 'system'}
                          content={content}
                          viewMode="markdown"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-muted max-w-[80%] rounded-lg px-3 py-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                      <div
                        className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: '0.1s' }}></div>
                      <div
                        className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
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

            <Separator />

            <div className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="debug-mode-embedded"
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
                  htmlFor="debug-mode-embedded"
                  className="text-muted-foreground cursor-pointer text-sm">
                  Show tool calls
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="ml-auto h-7 gap-1 px-2 text-xs"
                  disabled={isProcessing || chatMessages.length === 0}>
                  <RotateCcw className="h-3 w-3" />
                  New Chat
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="debug"
          className="mt-0 flex flex-1 flex-col overflow-hidden">
          <Tabs
            value={debugStreamType}
            onValueChange={v => setDebugStreamType(v as DebugStreamType)}
            className="flex h-full flex-col">
            <TabsList className="mx-2 mt-2 grid w-auto grid-cols-2">
              <TabsTrigger value="traces" className="text-xs">
                Traces
              </TabsTrigger>
              <TabsTrigger value="events" className="text-xs">
                Cluster Events
              </TabsTrigger>
            </TabsList>
            <TabsContent value="traces" className="mt-0 flex-1 overflow-hidden">
              <DebugStreamView
                entries={traces.entries}
                isConnected={traces.isConnected}
                isLoading={traces.isLoading}
                hasMore={traces.hasMore}
                error={traces.error}
                onLoadMore={traces.loadMore}
              />
            </TabsContent>
            <TabsContent value="events" className="mt-0 flex-1 overflow-hidden">
              <DebugStreamView
                entries={events.entries}
                isConnected={events.isConnected}
                isLoading={events.isLoading}
                hasMore={events.hasMore}
                error={events.error}
                onLoadMore={events.loadMore}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
