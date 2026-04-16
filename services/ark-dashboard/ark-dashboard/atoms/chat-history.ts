import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { v4 as uuidv4 } from 'uuid';

import type { ExtendedChatMessage } from '@/lib/types/chat-message';

export const CHAT_HISTORY_KEY = 'agent-chat-history';

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatSession {
  messages: ExtendedChatMessage[];
  sessionId: string;
  tokenUsage?: TokenUsage;
  messageTokenUsage?: Record<number, TokenUsage>;
  conversationId?: string;
}

type ChatHistoryMap = Record<string, ChatSession>;

const storage = createJSONStorage<ChatHistoryMap>(() => sessionStorage);

export const chatHistoryAtom = atomWithStorage<ChatHistoryMap>(
  CHAT_HISTORY_KEY,
  {},
  storage,
  { getOnInit: false },
);

export const createNewSessionId = (name: string) =>
  `chat-${name}-${uuidv4().slice(0, 7)}`;
