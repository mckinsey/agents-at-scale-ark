import { atom } from 'jotai';

export interface PendingMessage {
  role: 'user';
  content: string;
  timestamp: string;
}

type PendingMessagesMap = Record<string, PendingMessage[]>;
type ProcessingStateMap = Record<string, boolean>;

const pendingMessagesBaseAtom = atom<PendingMessagesMap>({});
const processingStateBaseAtom = atom<ProcessingStateMap>({});

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

export const sessionProcessingStateAtom = atom(
  get => get(processingStateBaseAtom),
  (get, set, conversationId: string, isProcessing: boolean) => {
    const current = get(processingStateBaseAtom);
    set(processingStateBaseAtom, {
      ...current,
      [conversationId]: isProcessing,
    });
  }
);
