import { atom } from 'jotai';
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

const chatHistoryBaseAtom = atom<ChatHistoryMap | null>(null);

export const chatHistoryAtom = atom(
  get => {
    const value = get(chatHistoryBaseAtom);
    if (value !== null) return value;

    if (typeof globalThis.window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(CHAT_HISTORY_KEY);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as ChatHistoryMap;
          }
        }
      } catch {
        // noop
      }
    }
    return {};
  },
  (
    get,
    set,
    update: ChatHistoryMap | ((prev: ChatHistoryMap) => ChatHistoryMap),
  ) => {
    const current = get(chatHistoryAtom);
    const newValue = typeof update === 'function' ? update(current) : update;
    set(chatHistoryBaseAtom, newValue);
    if (typeof globalThis.window !== 'undefined') {
      sessionStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(newValue));
    }
  },
);

export const createNewSessionId = (name: string) =>
  `chat-${name}-${uuidv4().slice(0, 7)}`;
