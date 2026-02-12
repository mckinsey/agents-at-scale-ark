import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface ExtendedChatMessage extends ChatCompletionMessageParam {
  metadata?: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    queryName?: string;
  };
}
