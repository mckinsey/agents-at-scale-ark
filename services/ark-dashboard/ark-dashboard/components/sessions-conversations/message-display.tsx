'use client';

import { useSearchParams } from 'next/navigation';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { buildApprovalDetails } from '@/lib/services/a2a-task-approvals';
import { useSubmitApproval } from '@/lib/services/a2a-task-approvals-hooks';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';
import type {
  Conversation,
  ConversationMessage,
} from '@/lib/services/conversations';
import { useGetMessages } from '@/lib/services/conversations-hooks';
import { useGetQuery, useListQueries } from '@/lib/services/queries-hooks';
import type { ChatMessage } from '@/lib/types/chat-message';
import { stripNamespace } from '@/lib/utils/participant';
import { getParticipantIcon } from '@/lib/utils/participant-icon';

import { ApprovalNotification } from './approval-notification';
import { SessionMessage } from './session-message';

const FALLBACK_PARTICIPANT_NAME = 'Participant';
const FALLBACK_PARTICIPANT_TYPE = 'agent';

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
  readonly pendingMessages: Array<{
    role: 'user';
    content: string;
    timestamp: string;
  }>;
  readonly onClearPending: () => void;
  readonly isProcessing: boolean;
  readonly showToolCalls: boolean;
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
  readonly isTemporary: boolean;
  readonly messages: ConversationMessage[] | undefined;
  readonly pendingMessages: Array<{
    role: 'user';
    content: string;
    timestamp: string;
  }>;
  readonly participantName: string;
  readonly isProcessing: boolean;
  readonly showToolCalls: boolean;
  readonly queryName?: string;
  readonly queryNamespace?: string;
  readonly approvalData?: ApprovalData & { taskId: string };
  readonly existingDecision?: 'approved' | 'rejected';
  readonly isWaitingForNextMessage?: boolean;
  readonly onApprove?: () => Promise<void>;
  readonly onReject?: () => Promise<void>;
}

const MessageContent = memo(function MessageContent({
  isTemporary,
  messages,
  pendingMessages,
  participantName,
  isProcessing,
  showToolCalls,
  queryName,
  queryNamespace,
  approvalData,
  existingDecision,
  isWaitingForNextMessage = false,
  onApprove,
  onReject,
}: MessageContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingMessages]);

  const processedMessages =
    messages && messages.length > 0
      ? enhanceMessagesWithToolResults(messages)
      : [];

  const hasBackendMessages = processedMessages.length > 0;

  const backendUserMessages = hasBackendMessages
    ? new Set(
        processedMessages
          .filter(msg => msg.message.role === 'user')
          .map(msg => msg.message.content?.trim()),
      )
    : new Set();

  const uniquePendingMessages = pendingMessages.filter(
    pending => !backendUserMessages.has(pending.content.trim()),
  );

  const hasPendingMessages = uniquePendingMessages.length > 0;

  if (isTemporary && !hasBackendMessages && !hasPendingMessages) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-center">
        <div>
          <p className="mb-2 text-sm">
            Conversation started with {participantName}
          </p>
          <p className="text-xs">
            Send a message below to begin the conversation
          </p>
        </div>
      </div>
    );
  }

  if (hasBackendMessages || hasPendingMessages) {
    return (
      <>
        {hasBackendMessages &&
          processedMessages.map(msg => (
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
        {hasPendingMessages &&
          uniquePendingMessages.map((msg, idx) => (
            <SessionMessage
              key={`pending-${msg.timestamp}-${idx}`}
              role="user"
              content={msg.content}
            />
          ))}
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
  pendingMessages,
  onClearPending,
  isProcessing,
  showToolCalls,
}: Props) {
  const { data: messages, isLoading } = useGetMessages(
    sessionId,
    conversationId,
  );
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const [isWaitingForNextMessage, setIsWaitingForNextMessage] = useState(false);
  const [messageCountWhenWaitingStarted, setMessageCountWhenWaitingStarted] =
    useState<number | null>(null);

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType =
    conversation?.participantType || FALLBACK_PARTICIPANT_TYPE;
  const isTemporary = conversation?.isTemporary || false;

  // Get the latest query ID from messages
  const latestQueryId = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    return messages[messages.length - 1]?.query_id || null;
  }, [messages]);

  // When processing and no query ID from messages, poll for recent queries for this session
  // This handles the case where approval is needed before messages are stored in broker
  const shouldFetchQueries = !latestQueryId && isProcessing;
  const { data: recentQueries } = useListQueries(
    shouldFetchQueries ? { page: 1, pageSize: 50 } : undefined,
    shouldFetchQueries,
  );

  // Find the most recent query for this session that's awaiting approval
  const pendingApprovalQuery = useMemo(() => {
    if (latestQueryId || !isProcessing || !recentQueries?.items) return null;

    // Filter to this session and input-required phase
    const sessionQueries = recentQueries.items
      .filter(
        q => q.sessionId === sessionId && q.status?.phase === 'input-required',
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

    return sessionQueries[0] || null;
  }, [recentQueries, sessionId, latestQueryId, isProcessing]);

  const effectiveQueryId = latestQueryId || pendingApprovalQuery?.name || null;

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

  useEffect(() => {
    // Clear processing only when agent response appears after pending user message
    if (
      !isProcessing ||
      !messages ||
      messages.length === 0 ||
      pendingMessages.length === 0
    ) {
      return;
    }

    // Find the user message in backend that matches the last pending message
    const lastPendingContent = pendingMessages.at(-1)?.content.trim();
    if (!lastPendingContent) {
      return;
    }

    // Find the backend user message with matching content
    const userMessageInBackend = messages
      .filter(msg => msg.message.role === 'user')
      .find(msg => msg.message.content?.trim() === lastPendingContent);

    if (!userMessageInBackend) {
      return;
    }

    // Check if there's an assistant message with a higher sequence number
    const assistantMessages = messages.filter(msg => {
      const isAssistant = msg.message.role === 'assistant';
      const isAfterUser = msg.sequence > userMessageInBackend.sequence;
      return isAssistant && isAfterUser;
    });

    if (assistantMessages.length > 0) {
      onClearPending();
    }
  }, [messages, pendingMessages, isProcessing, onClearPending]);

  // Clear waiting state when messages change (new message arrives) or when approval is no longer needed
  useEffect(() => {
    if (!isWaitingForNextMessage || messageCountWhenWaitingStarted === null) {
      return;
    }

    const currentMessageCount = messages?.length || 0;
    console.log('[HITL Debug] Checking waiting state:', {
      currentMessageCount,
      messageCountWhenWaitingStarted,
      needsApproval,
      isWaitingForNextMessage,
    });

    // Clear waiting state if:
    // 1. A new message arrived (count increased)
    // 2. Approval is no longer needed
    if (
      currentMessageCount > messageCountWhenWaitingStarted ||
      !needsApproval
    ) {
      console.log('[HITL Debug] Clearing waiting state');
      setIsWaitingForNextMessage(false);
      setMessageCountWhenWaitingStarted(null);
    }
  }, [
    isWaitingForNextMessage,
    messageCountWhenWaitingStarted,
    messages,
    needsApproval,
  ]);

  if (isLoading && pendingMessages.length === 0) {
    return <Skeleton className="flex-1" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-muted border-b p-4">
        <div className="flex items-center gap-2">
          {getParticipantIcon(participantType, { size: '4' })}
          <span className="font-semibold">
            {stripNamespace(participantName)}
          </span>
          <Badge className="bg-muted/50 text-muted-foreground border-0 capitalize">
            {participantType}
          </Badge>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <MessageContent
          isTemporary={isTemporary}
          messages={messages}
          pendingMessages={pendingMessages}
          participantName={participantName}
          isProcessing={isProcessing}
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
        />
      </div>
    </div>
  );
}
