import type { ChatResponse, chatService } from '@/lib/services/chat';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';

type ResultMessage = NonNullable<ChatResponse['messages']>[number];

export function findTurnStartIndex(messages: ExtendedChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i + 1;
    }
  }
  return messages.length;
}

export function stripEmptyAssistantPlaceholder(
  messages: ExtendedChatMessage[],
): ExtendedChatMessage[] {
  const last = messages[messages.length - 1];
  if (
    last?.role === 'assistant' &&
    !last.content &&
    !last.tool_calls &&
    !last.approvalRequest
  ) {
    return messages.slice(0, -1);
  }
  return messages;
}

// Converts a query-result message (OpenAI-ish shape) into the dashboard's
// ExtendedChatMessage. Extracted to keep pollAfterApproval's complexity low.
export function convertResultMessage(msg: ResultMessage): ExtendedChatMessage {
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
export function buildCascadingApprovalMessage(
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
