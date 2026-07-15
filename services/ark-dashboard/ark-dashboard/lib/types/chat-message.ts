import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

export interface ArkCompletedQueryData {
  completedQuery?: {
    metadata?: { name?: string };
    status?: {
      phase?: string;
      conversationId?: string;
      response?: {
        content?: string;
        raw?: string;
      };
      tokenUsage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        cachedTokens?: number;
      };
    };
  };
}

export interface ToolApprovalRequest {
  type: 'tool_approval_request';
  taskId: string;
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
  // Wall-clock timestamp (ms since epoch) when this approval request was
  // received by the dashboard. Used to compute approval expiry on the client.
  receivedAtMs?: number;
}

export type ArkExtendedChunk =
  | (ChatCompletionChunk & {
      error?: { message?: string; code?: string };
      ark?: ArkCompletedQueryData & {
        agent?: string;
        query?: string;
        systemMessage?: string;
      };
    })
  | ToolApprovalRequest;

export interface GraphEdge {
  from: string;
  to: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export type ExtendedChatMessage = ChatMessage & {
  metadata?: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    queryName?: string;
  };
  approvalRequest?: ToolApprovalRequest;
};
