'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface ChatContextType {
  openChats: string[];
  isOpen: (name: string) => boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const getInitialOpenChats = (): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = sessionStorage.getItem('open-chat-windows');
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return (parsed as Array<{ name?: unknown }>)
          .map(w => (typeof w?.name === 'string' ? w.name : ''))
          .filter(Boolean);
      }
    }
  } catch {
    // noop
  }
  return [];
};

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [openChats, setOpenChats] = useState<string[]>(getInitialOpenChats);

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
