'use client';

import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';

import type { ChatType } from '@/lib/chat-events';
import type { GraphEdge } from '@/lib/types/chat-message';
import { openChatWindowsAtom } from '@/atoms/internal-states';

import FloatingChat from './floating-chat';

interface ChatWindow {
  id: string;
  name: string;
  type: ChatType;
  position: number;
  strategy?: string;
  graphEdges?: GraphEdge[];
}

export default function ChatManager() {
  const [openChatWindows, setOpenChatWindows] = useAtom(openChatWindowsAtom);
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>(() =>
    openChatWindows.map(({ name, type, strategy, graphEdges }, index) => ({
      id: `${name}-${Date.now()}-${index}`,
      name,
      type,
      position: index,
      strategy,
      graphEdges,
    })),
  );
  useEffect(() => {
    setOpenChatWindows(
      chatWindows.map(({ name, type, strategy, graphEdges }) => ({
        name,
        type,
        strategy,
        graphEdges,
      })),
    );
  }, [chatWindows, setOpenChatWindows]);

  useEffect(() => {
    const handleOpenChat = (event: CustomEvent) => {
      const { name, type, strategy, graphEdges } = event.detail;
      const id = `${name}-${Date.now()}`;

      setChatWindows(prev => {
        const existingChat = prev.find(chat => chat.name === name);
        if (existingChat) return prev;

        return [
          ...prev,
          {
            id,
            name,
            type,
            position: prev.length,
            strategy,
            graphEdges,
          },
        ];
      });
    };

    const handleToggleChat = (event: CustomEvent) => {
      const { name, type, strategy, graphEdges } = event.detail;

      setChatWindows(prev => {
        const existingChat = prev.find(chat => chat.name === name);

        if (existingChat) {
          const newWindows = prev.filter(chat => chat.id !== existingChat.id);
          return newWindows.map((chat, index) => ({
            ...chat,
            position: index,
          }));
        } else {
          const id = `${name}-${Date.now()}`;
          return [
            ...prev,
            {
              id,
              name,
              type,
              position: prev.length,
              strategy,
              graphEdges,
            },
          ];
        }
      });
    };

    globalThis.addEventListener(
      'open-floating-chat',
      handleOpenChat as EventListener,
    );
    globalThis.addEventListener(
      'toggle-floating-chat',
      handleToggleChat as EventListener,
    );
    return () => {
      globalThis.removeEventListener(
        'open-floating-chat',
        handleOpenChat as EventListener,
      );
      globalThis.removeEventListener(
        'toggle-floating-chat',
        handleToggleChat as EventListener,
      );
    };
  }, []);

  const handleCloseChat = (id: string) => {
    setChatWindows(prev => {
      const newWindows = prev.filter(chat => chat.id !== id);
      return newWindows.map((chat, index) => ({
        ...chat,
        position: index,
      }));
    });
  };

  return (
    <>
      {chatWindows.map(chat => (
        <FloatingChat
          key={chat.id}
          id={chat.id}
          name={chat.name}
          type={chat.type}
          position={chat.position}
          strategy={chat.strategy}
          graphEdges={chat.graphEdges}
          onClose={() => handleCloseChat(chat.id)}
        />
      ))}
    </>
  );
}
