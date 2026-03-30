'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

import { CHAT_WINDOWS_SESSION_KEY } from '@/atoms/chat-history';

interface ChatContextType {
  openChats: string[];
  isOpen: (name: string) => boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [openChats, setOpenChats] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_WINDOWS_SESSION_KEY);
      if (saved) {
        const windows = JSON.parse(saved) as Array<{ name: string }>;
        const names = windows.map(w => w.name);
        if (names.length > 0) {
          setOpenChats(names);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    const handleChatOpened = (event: CustomEvent) => {
      const { name } = event.detail;
      setOpenChats(prev => {
        if (!prev.includes(name)) {
          return [...prev, name];
        }
        return prev;
      });
    };

    const handleChatClosed = (event: CustomEvent) => {
      const { name } = event.detail;
      setOpenChats(prev => prev.filter(chat => chat !== name));
    };

    window.addEventListener('chat-opened', handleChatOpened as EventListener);
    window.addEventListener('chat-closed', handleChatClosed as EventListener);

    return () => {
      window.removeEventListener(
        'chat-opened',
        handleChatOpened as EventListener,
      );
      window.removeEventListener(
        'chat-closed',
        handleChatClosed as EventListener,
      );
    };
  }, []);

  const isOpen = (name: string) => openChats.includes(name);

  return (
    <ChatContext.Provider value={{ openChats, isOpen }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatState() {
  const context = useContext(ChatContext);
  if (!context) {
    // Return a default implementation when outside provider
    return {
      openChats: [],
      isOpen: () => false,
    };
  }
  return context;
}
