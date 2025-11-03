'use client';

import { useEffect, useRef, useState } from 'react';

import type { ChatType } from '@/lib/chat-events';

import FloatingChat from './floating-chat';

interface ChatWindow {
  id: string;
  name: string;
  type: ChatType;
  position: number;
}

export default function ChatManager() {
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const pendingEventsRef = useRef<
    Array<{ type: 'opened' | 'closed'; name: string }>
  >([]);

  // Handle pending events after state updates
  useEffect(() => {
    if (pendingEventsRef.current.length > 0) {
      const events = [...pendingEventsRef.current];
      pendingEventsRef.current = [];

      events.forEach(event => {
        if (event.type === 'opened') {
          window.dispatchEvent(
            new CustomEvent('chat-opened', { detail: { name: event.name } }),
          );
        } else {
          window.dispatchEvent(
            new CustomEvent('chat-closed', { detail: { name: event.name } }),
          );
        }
      });
    }
  }, [chatWindows]);

  useEffect(() => {
    const handleOpenChat = (event: CustomEvent) => {
      const { name, type } = event.detail;
      const id = `${name}-${Date.now()}`;

      setChatWindows(prev => {
        // Check if a chat with this name already exists
        const existingChat = prev.find(chat => chat.name === name);
        if (existingChat) return prev;

        // Queue event to be dispatched after state update
        pendingEventsRef.current.push({ type: 'opened', name });

        // Add new chat window
        return [
          ...prev,
          {
            id,
            name,
            type,
            position: prev.length,
          },
        ];
      });
    };

    const handleToggleChat = (event: CustomEvent) => {
      const { name, type } = event.detail;

      setChatWindows(prev => {
        const existingChat = prev.find(chat => chat.name === name);

        if (existingChat) {
          // Queue event to be dispatched after state update
          pendingEventsRef.current.push({ type: 'closed', name });

          // Close existing chat
          const newWindows = prev.filter(chat => chat.id !== existingChat.id);
          return newWindows.map((chat, index) => ({
            ...chat,
            position: index,
          }));
        } else {
          // Queue event to be dispatched after state update
          pendingEventsRef.current.push({ type: 'opened', name });

          // Open new chat
          const id = `${name}-${Date.now()}`;
          return [
            ...prev,
            {
              id,
              name,
              type,
              position: prev.length,
            },
          ];
        }
      });
    };

    window.addEventListener(
      'open-floating-chat',
      handleOpenChat as EventListener,
    );
    window.addEventListener(
      'toggle-floating-chat',
      handleToggleChat as EventListener,
    );
    return () => {
      window.removeEventListener(
        'open-floating-chat',
        handleOpenChat as EventListener,
      );
      window.removeEventListener(
        'toggle-floating-chat',
        handleToggleChat as EventListener,
      );
    };
  }, []);

  const handleCloseChat = (id: string) => {
    setChatWindows(prev => {
      const closingChat = prev.find(chat => chat.id === id);
      if (closingChat) {
        // Queue event to be dispatched after state update
        pendingEventsRef.current.push({
          type: 'closed',
          name: closingChat.name,
        });
      }
      const newWindows = prev.filter(chat => chat.id !== id);
      // Recalculate positions
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
          onClose={() => handleCloseChat(chat.id)}
        />
      ))}
    </>
  );
}
