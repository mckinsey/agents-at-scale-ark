'use client';

import { useAtomValue } from 'jotai';

import { openChatWindowsAtom } from '@/atoms/internal-states';

export function useChatState() {
  const openChatWindows = useAtomValue(openChatWindowsAtom);
  return {
    isOpen: (name: string) => openChatWindows.some(w => w.name === name),
  };
}
