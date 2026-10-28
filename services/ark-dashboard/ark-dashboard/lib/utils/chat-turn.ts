import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

import type { TokenUsage } from '@/atoms/chat-history';
import type { ChatResponse, chatService } from '@/lib/services/chat';
import type {
  ArkCompletedQueryData,
  ExtendedChatMessage,
} from '@/lib/types/chat-message';

export type ResultMessage = NonNullable<ChatResponse['messages']>[number];

export interface AccumulatedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type ToolCallDelta = NonNullable<
  ChatCompletionChunk['choices'][number]['delta']['tool_calls']
>[number];

type ArkTokenUsage = NonNullable<
  NonNullable<ArkCompletedQueryData['completedQuery']>['status']
>['tokenUsage'];

const TURN_RESPONSE_ROLES = new Set(['system', 'tool', 'assistant']);

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
  const last = messages.at(-1);
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
  const baseMsg: ExtendedChatMessage = {
    role: msg.role === 'user' ? 'user' : 'system',
    content: msg.content || '',
  };
  if (msg.role === 'user' && msg.name) {
    baseMsg.name = msg.name;
  }
  return baseMsg;
}

export function convertTurnMessages(
  messages: ResultMessage[],
): ExtendedChatMessage[] {
  return messages
    .filter(msg => TURN_RESPONSE_ROLES.has(msg.role))
    .map(convertResultMessage);
}

export function accumulateToolCallDeltas(
  accumulated: AccumulatedToolCall[],
  deltas: ToolCallDelta[],
): void {
  for (const delta of deltas) {
    let index = delta.id ? accumulated.findIndex(tc => tc.id === delta.id) : -1;
    if (index === -1 && delta.function?.name) {
      accumulated.push({
        id: delta.id || '',
        type: 'function',
        function: { name: delta.function.name, arguments: '' },
      });
      index = accumulated.length - 1;
    }
    if (index === -1) continue;
    if (delta.id) {
      accumulated[index].id = delta.id;
    }
    if (delta.function?.arguments) {
      accumulated[index].function.arguments += delta.function.arguments;
    }
  }
}

export function extractTokenUsage(
  arkUsage: ArkTokenUsage,
  chunkUsage: ChatCompletionChunk['usage'],
): TokenUsage | null {
  if (arkUsage) {
    return {
      prompt_tokens: arkUsage.promptTokens || 0,
      completion_tokens: arkUsage.completionTokens || 0,
      total_tokens: arkUsage.totalTokens || 0,
      cached_tokens: arkUsage.cachedTokens || 0,
    };
  }
  if (chunkUsage) {
    return {
      prompt_tokens: chunkUsage.prompt_tokens ?? 0,
      completion_tokens: chunkUsage.completion_tokens ?? 0,
      total_tokens: chunkUsage.total_tokens ?? 0,
      cached_tokens: chunkUsage.prompt_tokens_details?.cached_tokens ?? 0,
    };
  }
  return null;
}

export function buildPollResultMessages(
  result: ChatResponse,
  queryName: string,
): ExtendedChatMessage[] {
  if (result.status === 'done') {
    if (result.messages && result.messages.length > 0) {
      return result.messages.map(convertResultMessage);
    }
    return result.response
      ? [{ role: 'assistant', content: result.response }]
      : [];
  }
  if (result.status === 'error' || result.status === 'unknown') {
    return [
      {
        role: 'assistant',
        content:
          result.status === 'error'
            ? result.response || 'Query failed'
            : 'Query status unknown',
        metadata: { status: 'failed', queryName },
      },
    ];
  }
  return [];
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
