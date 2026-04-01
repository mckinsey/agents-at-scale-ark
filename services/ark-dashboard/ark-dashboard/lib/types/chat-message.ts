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
      };
    };
  };
}

export type ArkExtendedChunk = ChatCompletionChunk & {
  error?: { message?: string; code?: string };
  ark?: ArkCompletedQueryData & {
    agent?: string;
    query?: string;
    systemMessage?: string;
  };
};


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
};
