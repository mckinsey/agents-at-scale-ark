import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type ExtendedChatMessage = ChatCompletionMessageParam & {
  metadata?: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    queryName?: string;
  };
};
