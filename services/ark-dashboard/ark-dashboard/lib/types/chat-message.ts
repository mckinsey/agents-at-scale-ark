import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

export interface ArkCompletedQueryData {
  completedQuery?: {
    metadata?: { name?: string };
    status?: {
      phase?: string;
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
  ark?: ArkCompletedQueryData & { agent?: string; query?: string };
};

export interface GraphEdge {
  from: string;
  to: string;
}

export type ExtendedChatMessage = ChatCompletionMessageParam & {
  metadata?: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    queryName?: string;
  };
};
