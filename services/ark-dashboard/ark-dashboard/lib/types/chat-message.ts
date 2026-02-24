import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
