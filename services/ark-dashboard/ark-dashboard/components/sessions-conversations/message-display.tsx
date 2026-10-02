'use client';

import { type RefObject, memo, useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Build } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useStickyScroll } from '@/lib/hooks/use-sticky-scroll';
import { buildApprovalDetails } from '@/lib/services/a2a-task-approvals';
import { useSubmitApproval } from '@/lib/services/a2a-task-approvals-hooks';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';
import type {
  Conversation,
  ConversationMessage,
} from '@/lib/services/conversations';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import { queriesService } from '@/lib/services/queries';
import { useGetQuery } from '@/lib/services/queries-hooks';
import type { ChatMessage } from '@/lib/types/chat-message';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IconShell } from '@/components/ui/icon-shell';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';
import { useNamespace } from '@/providers/NamespaceProvider';

import { ApprovalNotification } from './approval-notification';
import { SessionMessage } from './session-message';

const FALLBACK_PARTICIPANT_NAME = 'Participant';
const FALLBACK_PARTICIPANT_TYPE = 'agent';
const RECENT_QUERIES_QUERY_KEY = 'recent-queries';
const RECENT_QUERIES_PARAMS = { page: 1, pageSize: 50 };
const RECENT_QUERIES_POLL_MS = 5000;
const RECENT_QUERIES_MAX_POLLS = 24;

type ToolCall = NonNullable<ChatMessage['tool_calls']>[number];
type EnhancedToolCall = ToolCall & { result?: string };

interface EnhancedChatMessage extends Omit<ChatMessage, 'tool_calls' | 'role'> {
  role: 'user' | 'assistant' | 'system';
  tool_calls?: EnhancedToolCall[];
}

interface EnhancedConversationMessage extends Omit<
  ConversationMessage,
  'message'
> {
  message: EnhancedChatMessage;
}

interface Props {
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly showToolCalls: boolean;
  readonly onShowToolCallsChange: (show: boolean) => void;
}

function enhanceMessagesWithToolResults(
  messages: ConversationMessage[],
): EnhancedConversationMessage[] {
  // Build a map of tool_call_id -> tool result content
  const toolResults = new Map<string, string>();
  messages.forEach(msg => {
    if (
      msg.message?.role === 'tool' &&
      msg.message?.tool_call_id &&
      msg.message?.content
    ) {
      toolResults.set(msg.message.tool_call_id, msg.message.content);
    }
  });

  // Filter out tool messages and enhance tool_calls with results
  return messages
    .filter(msg => msg.message?.role !== 'tool') // Skip tool response messages
    .map(msg => {
      // If message has tool_calls, add results to them
      if (msg.message?.tool_calls && Array.isArray(msg.message.tool_calls)) {
        const enhancedToolCalls: EnhancedToolCall[] =
          msg.message.tool_calls.map(tc => ({
            ...tc,
            result: toolResults.get(tc.id),
          }));
        return {
          ...msg,
          message: {
            ...msg.message,
            role: msg.message.role as 'user' | 'assistant' | 'system',
            tool_calls: enhancedToolCalls,
          },
        };
      }
      return {
        ...msg,
        message: {
          ...msg.message,
          role: msg.message.role as 'user' | 'assistant' | 'system',
        },
      };
    });
}

interface ApprovalData {
  toolCalls: Array<{
    id: string;
    type: string;
    function?: {
      name: string;
      arguments: string;
    };
  }>;
  timeout?: string;
  onTimeout?: string;
  agentName?: string;
  expired?: boolean;
  expiresAtMs?: number;
}

interface MessageContentProps {
  readonly messages: ConversationMessage[] | undefined;
  readonly showToolCalls: boolean;
  readonly queryName?: string;
  readonly queryNamespace?: string;
  readonly approvalData?: ApprovalData & { taskId: string };
  readonly existingDecision?: 'approved' | 'rejected';
  readonly isWaitingForNextMessage?: boolean;
  readonly onApprove?: () => Promise<void>;
  readonly onReject?: () => Promise<void>;
  readonly endRef: RefObject<HTMLDivElement | null>;
}

const MessageContent = memo(function MessageContent({
  messages,
  showToolCalls,
  queryName,
  queryNamespace,
  approvalData,
  existingDecision,
  isWaitingForNextMessage = false,
  onApprove,
  onReject,
  endRef,
}: MessageContentProps) {
  const processedMessages =
    messages && messages.length > 0
      ? enhanceMessagesWithToolResults(messages)
      : [];

  const hasBackendMessages = processedMessages.length > 0;

  if (hasBackendMessages) {
    return (
      <>
        {processedMessages.map(msg => (
            <SessionMessage
              key={`${msg.query_id}-${msg.sequence}`}
              role={msg.message.role}
              content={msg.message.content || ''}
              toolCalls={msg.message.tool_calls}
              sender={msg.message.name}
              timestamp={msg.timestamp}
              showToolCalls={showToolCalls}
            />
          ))}
        {approvalData &&
          onApprove &&
          onReject &&
          queryName &&
          queryNamespace && (
            <ApprovalNotification
              key={approvalData.taskId}
              queryName={queryName}
              queryNamespace={queryNamespace}
              taskId={approvalData.taskId}
              toolCalls={approvalData.toolCalls}
              timeout={approvalData.timeout}
              onTimeout={approvalData.onTimeout}
              agentName={approvalData.agentName}
              expired={approvalData.expired}
              expiresAtMs={approvalData.expiresAtMs}
              existingDecision={existingDecision || null}
              onApprove={onApprove}
              onReject={onReject}
            />
          )}
        {isWaitingForNextMessage && (
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
        <div ref={endRef} />
      </>
    );
  }

  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-center">
      <div>
        <p className="mb-2 text-sm">No conversation messages available</p>
        <p className="text-xs">
          Workflow sessions don&apos;t have conversational messages. Check the
          Logs tab for execution details.
        </p>
      </div>
    </div>
  );
});

export function MessageDisplay({
  conversationId,
  sessionId,
  conversation,
  showToolCalls,
  onShowToolCallsChange,
}: Props) {
  const { data: messages, isLoading } = useGetMessages(
    sessionId,
    conversationId,
  );
  const {
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    resumeAutoScroll,
  } = useStickyScroll();
  const { namespace } = useNamespace();
  const toolCallCountId = useId();
  const [isWaitingForNextMessage, setIsWaitingForNextMessage] = useState(false);
  const [messageCountWhenWaitingStarted, setMessageCountWhenWaitingStarted] =
    useState<number | null>(null);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType =
    conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const toolCallCount = conversation?.toolCallCount || 0;

  // Get the latest query ID from messages
  const latestQueryId = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    return messages[messages.length - 1]?.query_id || null;
  }, [messages]);

  // A conversation with no messages yet still has to surface a pending approval,
  // so poll the session's queries until one of them supplies a query id. Stop
  // once this conversation's query is found - useGetQuery polls it from there -
  // and give up after a bounded number of attempts, because a conversation whose
  // query never produced a message would otherwise poll for as long as it is open.
  const { data: recentQueries } = useQuery({
    queryKey: [RECENT_QUERIES_QUERY_KEY, RECENT_QUERIES_PARAMS, namespace],
    queryFn: () => queriesService.list(namespace, RECENT_QUERIES_PARAMS),
    enabled: !latestQueryId && Boolean(namespace),
    refetchInterval: query => {
      if (query.state.dataUpdateCount >= RECENT_QUERIES_MAX_POLLS) return false;
      const found = query.state.data?.items?.some(
        q => q.sessionId === sessionId && q.conversationId === conversationId,
      );
      return found ? false : RECENT_QUERIES_POLL_MS;
    },
  });

  // Find the most recent query for this conversation. Matching on sessionId
  // alone would let a sibling conversation's input-required query render here
  // as this conversation's approval.
  const conversationQuery = useMemo(() => {
    if (latestQueryId || !recentQueries?.items) return null;

    const conversationQueries = recentQueries.items
      .filter(
        q => q.sessionId === sessionId && q.conversationId === conversationId,
      )
      .sort((a, b) => {
        // Sort by creation time descending
        const timeA = a.creationTimestamp
          ? new Date(a.creationTimestamp).getTime()
          : 0;
        const timeB = b.creationTimestamp
          ? new Date(b.creationTimestamp).getTime()
          : 0;
        return timeB - timeA;
      });

    return conversationQueries[0] || null;
  }, [recentQueries, sessionId, conversationId, latestQueryId]);

  const effectiveQueryId = latestQueryId || conversationQuery?.name || null;

  // Fetch query details to check if approval is needed and to find the linked A2ATask
  const { data: queryDetails } = useGetQuery(
    effectiveQueryId,
    !!effectiveQueryId,
  );
  const queryPhase = queryDetails?.status?.phase;
  const needsApproval = queryPhase === 'input-required';

  // Pull the A2ATask id from the query's status (status is loosely-typed, so cast carefully)
  const approvalTaskId = useMemo(() => {
    const status = queryDetails?.status as
      | { response?: { a2a?: { taskId?: unknown } } }
      | null
      | undefined;
    const taskId = status?.response?.a2a?.taskId;
    return typeof taskId === 'string' && taskId.length > 0 ? taskId : null;
  }, [queryDetails]);

  const approvalTaskName = approvalTaskId ? `a2a-task-${approvalTaskId}` : '';

  const { data: approvalTask } = useA2ATask(
    needsApproval ? approvalTaskName : '',
  );
  const approvalDetails = useMemo(
    () => (approvalTask ? buildApprovalDetails(approvalTask) : null),
    [approvalTask],
  );

  // Track submitted task decisions in session storage to persist across refreshes
  const getSubmittedTaskDecisions = (): Map<
    string,
    'approved' | 'rejected'
  > => {
    if (typeof window === 'undefined') return new Map();
    const stored = sessionStorage.getItem(`submitted-approvals-${sessionId}`);
    if (!stored) return new Map();
    try {
      const obj = JSON.parse(stored);
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  };

  const addSubmittedTaskDecision = (
    taskId: string,
    decision: 'approved' | 'rejected',
  ) => {
    if (typeof window === 'undefined') return;
    const submitted = getSubmittedTaskDecisions();
    submitted.set(taskId, decision);
    const obj = Object.fromEntries(submitted);
    sessionStorage.setItem(
      `submitted-approvals-${sessionId}`,
      JSON.stringify(obj),
    );
  };

  const existingDecision = approvalDetails?.taskId
    ? getSubmittedTaskDecisions().get(approvalDetails.taskId)
    : undefined;

  // Approval mutation against the A2ATask resource
  const { mutateAsync: submitApproval } = useSubmitApproval(
    approvalTaskName,
    namespace,
  );

  const handleApprove = async () => {
    if (approvalDetails?.taskId) {
      addSubmittedTaskDecision(approvalDetails.taskId, 'approved');
    }
    setMessageCountWhenWaitingStarted(messages?.length || 0);
    setIsWaitingForNextMessage(true);
    await submitApproval('approved');
  };

  const handleReject = async () => {
    if (approvalDetails?.taskId) {
      addSubmittedTaskDecision(approvalDetails.taskId, 'rejected');
    }
    setMessageCountWhenWaitingStarted(messages?.length || 0);
    setIsWaitingForNextMessage(true);
    await submitApproval('rejected');
  };

  // Clear waiting state when messages change (new message arrives) or when approval is no longer needed
  useEffect(() => {
    if (!isWaitingForNextMessage || messageCountWhenWaitingStarted === null) {
      return;
    }

    const currentMessageCount = messages?.length || 0;

    // Clear waiting state if:
    // 1. A new message arrived (count increased)
    // 2. Approval is no longer needed
    if (
      currentMessageCount > messageCountWhenWaitingStarted ||
      !needsApproval
    ) {
      setIsWaitingForNextMessage(false);
      setMessageCountWhenWaitingStarted(null);
    }
  }, [
    isWaitingForNextMessage,
    messageCountWhenWaitingStarted,
    messages,
    needsApproval,
  ]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isWaitingForNextMessage, scrollToBottom]);

  useEffect(() => {
    resumeAutoScroll();
  }, [conversationId, resumeAutoScroll]);

  if (isLoading) {
    return <Skeleton className="flex-1" />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stroke-tertiary bg-surface-bg-secondary px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <IconShell size="sm" className="opacity-100">
            {getParticipantIcon(participantType, { size: '4' })}
          </IconShell>
          <TruncatedTooltip label={stripNamespace(participantName)}>
            <span className="block min-w-0 truncate text-base font-semibold leading-6 text-fg-primary">
              {stripNamespace(participantName)}
            </span>
          </TruncatedTooltip>
          <span className="shrink-0 text-sm font-normal leading-5 text-fg-secondary capitalize">{participantType}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {toolCallCount > 0 && (
            <span
              id={toolCallCountId}
              className="text-fg-tertiary mr-1 font-mono text-xs">
              {toolCallCount.toLocaleString()} tool{' '}
              {toolCallCount === 1 ? 'call' : 'calls'}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={showToolCalls}
                aria-label={
                  showToolCalls ? 'Hide tool calls' : 'Show tool calls'
                }
                aria-describedby={
                  toolCallCount > 0 ? toolCallCountId : undefined
                }
                onClick={() => onShowToolCallsChange(!showToolCalls)}
                className="relative">
                <IconShell size="sm" variant="secondary">
                  <Build />
                </IconShell>
                <span
                  className={cn(
                    'absolute -right-0.5 -top-0.5 size-2 rounded-full',
                    showToolCalls ? 'bg-status-success' : 'bg-fg-disabled',
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showToolCalls ? 'Hide tool calls' : 'Show tool calls'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea
        viewportRef={scrollContainerRef}
        onViewportScroll={handleScroll}
        className="flex-1 h-0 border-r border-stroke-divider">
        <div className="space-y-4 p-4">
          <MessageContent
            messages={messages}
            showToolCalls={showToolCalls}
            queryName={effectiveQueryId || undefined}
            queryNamespace={namespace}
            approvalData={
              needsApproval && approvalDetails ? approvalDetails : undefined
            }
            existingDecision={existingDecision}
            isWaitingForNextMessage={isWaitingForNextMessage}
            onApprove={handleApprove}
            onReject={handleReject}
            endRef={messagesEndRef}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
