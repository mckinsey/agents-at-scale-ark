import { atom } from 'jotai';

export interface PendingMessage {
  role: 'user';
  content: string;
  timestamp: string;
}

type PendingMessagesMap = Record<string, PendingMessage[]>;

const pendingMessagesBaseAtom = atom<PendingMessagesMap>({});

export const sessionPendingMessagesAtom = atom(
  get => get(pendingMessagesBaseAtom),
  (get, set, conversationId: string, messages: PendingMessage[]) => {
    const current = get(pendingMessagesBaseAtom);
    set(pendingMessagesBaseAtom, {
      ...current,
      [conversationId]: messages,
    });
  }
);
