import { atomWithStorage, createJSONStorage } from 'jotai/utils';

import type { ExtendedChatMessage } from '@/lib/types/chat-message';

export const CHAT_HISTORY_KEY = 'agent-chat-history';

export interface ChatSession {
  messages: ExtendedChatMessage[];
  sessionId: string;
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

export const createNewSessionId = () => `session-${Date.now()}`;
