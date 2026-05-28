'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { DebugStreamView } from '@/components/chat/debug-stream-view';
import { useSSEStream } from '@/components/chat/use-sse-stream';
import {
  BugReport,
  ChatBubble,
  ErrorIcon,
  Info,
  Send,
  SingleTool,
} from '@/components/icons';
import { SessionMessage } from '@/components/sessions-conversations/session-message';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { NumericBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChatType } from '@/lib/chat-events';
import { useChatSession } from '@/lib/hooks';
import type { ParticipantType } from '@/lib/services/conversations';
import { type BrokerStatus, proxyService } from '@/lib/services/proxy';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

function toParticipantType(type: ChatType): ParticipantType | undefined {
  if (type === 'agent' || type === 'team') return type;
  return undefined;
}

type ToolCallWithResult = NonNullable<
  ExtendedChatMessage['tool_calls']
>[number] & { result?: string };

interface DisplayMessage {
  key: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallWithResult[];
  sender?: string;
}

function buildDisplayMessages(
  messages: ExtendedChatMessage[],
): DisplayMessage[] {
  const toolResults = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      toolResults.set(msg.tool_call_id, msg.content);
    }
  }

  return messages
    .filter(m => m.role !== 'tool')
    .map((msg, index) => {
      const enhancedToolCalls = msg.tool_calls?.map(tc => ({
        ...tc,
        result: toolResults.get(tc.id),
      }));
      return {
        key: `${msg.metadata?.queryName ?? 'msg'}-${index}`,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content ?? '',
        toolCalls: enhancedToolCalls,
        sender: msg.name,
      };
    });
}

type TabType = 'chat' | 'debug';
type DebugStreamType = 'traces' | 'events';

interface AgentChatPanelProps {
  name: string;
  type: ChatType;
}

export function AgentChatPanel({ name, type }: AgentChatPanelProps) {
  const {
    messages,
    isProcessing,
    sendMessage,
    messagesEndRef,
    cancelQuery,
  } = useChatSession({ name, type });

  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [debugStreamType, setDebugStreamType] =
    useState<DebugStreamType>('traces');
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | 'checking'>(
    'checking',
  );

  const [draft, setDraft] = useState('');
  const [showToolCalls, setShowToolCalls] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const traces = useSSEStream('/v1/broker/traces', 'default', name);
  const events = useSSEStream('/v1/broker/events', 'default', name);

  useEffect(() => {
    proxyService
      .checkBrokerHealth()
      .then(setBrokerStatus)
      .catch(() => setBrokerStatus('not-installed'));
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!isProcessing && activeTab === 'chat') inputRef.current?.focus();
  }, [isProcessing, activeTab]);

  const displayMessages = useMemo(
    () => buildDisplayMessages(messages),
    [messages],
  );

  const toolCallCount = useMemo(
    () =>
      displayMessages.reduce(
        (acc, m) => acc + (m.toolCalls?.length ?? 0),
        0,
      ),
    [displayMessages],
  );

  const handleSend = async () => {
    if (!draft.trim() || isProcessing) return;
    const message = draft.trim();
    setDraft('');
    inputRef.current?.focus();
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = stripNamespace(name);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as TabType)}
        className="flex h-full flex-col">
        <div className="bg-surface-bg-secondary border-stroke-tertiary flex-shrink-0 border-b">
          <div className="flex items-center gap-2 px-5 pt-4">
            <IconShell size="sm" className="opacity-100">
              {getParticipantIcon(toParticipantType(type), {
                size: '4',
                name,
              })}
            </IconShell>
            <span className="text-fg-primary text-base leading-6 font-semibold">
              {displayName}
            </span>
            <span className="text-fg-secondary text-sm leading-5 font-normal capitalize">
              {type}
            </span>
          </div>
          <TabsList className="mx-5 mt-2">
            <TabsTrigger value="chat" className="gap-1.5">
              <IconShell size="sm">
                <ChatBubble />
              </IconShell>
              Chat
            </TabsTrigger>
            <TabsTrigger value="debug" className="gap-1.5">
              <IconShell size="sm">
                <BugReport />
              </IconShell>
              Debug
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="chat"
          className="!py-0 mt-0 flex flex-1 flex-col overflow-hidden">
          <ScrollArea className="border-stroke-divider h-0 flex-1 border-r">
            <div className="space-y-4 p-4">
              {displayMessages.length === 0 && !isProcessing ? (
                <div className="text-fg-secondary flex h-full flex-col items-center justify-center gap-1 py-12 text-center">
                  <p className="text-sm">
                    Start a conversation with {displayName}
                  </p>
                  <p className="text-fg-tertiary text-xs">
                    Send a message below to begin.
                  </p>
                </div>
              ) : (
                <>
                  {displayMessages.map(msg => (
                    <SessionMessage
                      key={msg.key}
                      role={msg.role}
                      content={msg.content}
                      toolCalls={msg.toolCalls}
                      sender={msg.sender}
                      showToolCalls={showToolCalls}
                    />
                  ))}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-fill-muted flex gap-1 px-3 py-2">
                        <span className="bg-fg-tertiary size-2 animate-bounce rounded-full" />
                        <span
                          className="bg-fg-tertiary size-2 animate-bounce rounded-full"
                          style={{ animationDelay: '0.1s' }}
                        />
                        <span
                          className="bg-fg-tertiary size-2 animate-bounce rounded-full"
                          style={{ animationDelay: '0.2s' }}
                        />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </ScrollArea>

          <div className="bg-surface-bg-base border-stroke-divider flex flex-col items-start justify-start overflow-hidden border-t border-r border-b pb-8">
            <div className="flex w-full flex-col items-start justify-start gap-4 self-stretch px-4 pt-3">
              <div className="bg-surface-bg-primary flex h-16 w-full items-center justify-start gap-2 p-3">
                <Input
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${displayName}`}
                  disabled={isProcessing}
                  className="placeholder:text-fg-tertiary h-4 flex-1 border-0 bg-transparent p-0 text-sm font-normal shadow-none hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 disabled:bg-transparent disabled:hover:bg-transparent"
                />
                {isProcessing ? (
                  <Button
                    onClick={cancelQuery}
                    variant="ghost"
                    size="icon"
                    aria-label="Stop"
                    className="bg-surface-bg-tertiary hover:bg-surface-bg-tertiary/80 flex size-8 items-center justify-center">
                    <IconShell size="sm" className="opacity-100">
                      <SingleTool />
                    </IconShell>
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={!draft.trim()}
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

              <div className="flex items-center justify-between self-stretch pb-2">
                <div className="flex items-center justify-start gap-5">
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
                    checked={showToolCalls}
                    onCheckedChange={setShowToolCalls}
                    className="scale-75"
                    aria-label="Toggle tool call visibility"
                  />
                  <span className="text-fg-secondary text-xs leading-4 font-normal tracking-tight">
                    Show tool calls
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="debug"
          className="!py-0 mt-0 flex flex-1 flex-col overflow-hidden">
          {brokerStatus === 'checking' && (
            <div className="text-fg-secondary flex flex-1 items-center justify-center text-sm">
              Checking broker availability...
            </div>
          )}
          {brokerStatus === 'not-installed' && (
            <div className="p-4">
              <Alert layout="long">
                <AlertIcon className="text-status-information">
                  <IconShell size="default">
                    <Info />
                  </IconShell>
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Broker service not available</AlertTitle>
                  <AlertDescription>
                    For the debug view to work, install the broker service and
                    turn on the setting in the experimental features window
                    (Ctrl+E).
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </div>
          )}
          {brokerStatus === 'not-running' && (
            <div className="p-4">
              <Alert layout="long">
                <AlertIcon className="text-status-error">
                  <IconShell size="default">
                    <ErrorIcon />
                  </IconShell>
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>Broker service is not running</AlertTitle>
                  <AlertDescription>
                    The broker service is installed but is not currently running.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            </div>
          )}
          {brokerStatus === 'available' && (
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
              <TabsContent
                value="traces"
                className="mt-0 flex-1 overflow-hidden">
                <DebugStreamView
                  entries={traces.entries}
                  isConnected={traces.isConnected}
                  isLoading={traces.isLoading}
                  hasMore={traces.hasMore}
                  error={traces.error}
                  onLoadMore={traces.loadMore}
                />
              </TabsContent>
              <TabsContent
                value="events"
                className="mt-0 flex-1 overflow-hidden">
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
