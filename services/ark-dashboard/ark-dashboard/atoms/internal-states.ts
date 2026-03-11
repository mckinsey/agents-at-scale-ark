import { atom } from 'jotai';

export const experimentalFeaturesDialogOpenAtom = atom(false);

const SESSION_STORAGE_KEY = 'files-browser-prefix';

const filesBrowserPrefixBaseAtom = atom<string | null>(null);

export const filesBrowserPrefixAtom = atom(
  get => {
    const value = get(filesBrowserPrefixBaseAtom);
    if (value !== null) {
      return value;
    }

    // First read - initialize from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as string;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return '';
  },
  (get, set, newValue: string) => {
    set(filesBrowserPrefixBaseAtom, newValue);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newValue));
    }
  },
);

const LAST_CONVERSATION_ID_KEY = 'last-conversation-id';
const lastConversationIdBaseAtom = atom<string | null>(null);
export const lastConversationIdAtom = atom(
  get => {
    const value = get(lastConversationIdBaseAtom);
    if (value !== null) {
      return value;
    }

    // First read - initialize from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(LAST_CONVERSATION_ID_KEY);
        if (stored) {
          return JSON.parse(stored) as string;
        }
      } catch {
        // Ignore parse errors
      }
    }
    return null;
  },
  (get, set, newValue: string | null) => {
    set(lastConversationIdBaseAtom, newValue);
    if (typeof window !== 'undefined') {
      if (newValue === null) {
        sessionStorage.removeItem(LAST_CONVERSATION_ID_KEY);
      } else {
        sessionStorage.setItem(
          LAST_CONVERSATION_ID_KEY,
          JSON.stringify(newValue),
        );
      }
    }
  },
);
