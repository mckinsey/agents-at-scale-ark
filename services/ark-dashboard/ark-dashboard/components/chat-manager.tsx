'use client';

import { useAtom } from 'jotai';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { openChatWindowsAtom } from '@/atoms/internal-states';
import { ArrowBack, ArrowForward } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { useSidebar } from '@/components/ui/sidebar';
import type { ChatType } from '@/lib/chat-events';
import type { GraphEdge } from '@/lib/types/chat-message';
import { cn } from '@/lib/utils';

import FloatingChat from './floating-chat';

const SLOT_GAP = 8;
const MIN_SLOT_WIDTH = 266;
const MAX_SLOT_WIDTH = 560;
const PAGER_WIDTH = 2 * 36 + 2 * SLOT_GAP;

interface ChatWindow {
  id: string;
  name: string;
  type: ChatType;
  strategy?: string;
  graphEdges?: GraphEdge[];
  minimized: boolean;
}

interface ChatBarLayout {
  slotWidth: number;
  visibleCount: number;
  showPager: boolean;
}

function getChatBarLayout(
  count: number,
  availableWidth: number,
): ChatBarLayout {
  const fitsAll =
    count * MIN_SLOT_WIDTH + (count - 1) * SLOT_GAP <= availableWidth;
  const trackWidth = fitsAll ? availableWidth : availableWidth - PAGER_WIDTH;
  const visibleCount = fitsAll
    ? count
    : Math.max(
        1,
        Math.floor((trackWidth + SLOT_GAP) / (MIN_SLOT_WIDTH + SLOT_GAP)),
      );
  const slotWidth = Math.min(
    MAX_SLOT_WIDTH,
    Math.max(
      MIN_SLOT_WIDTH,
      (trackWidth - (visibleCount - 1) * SLOT_GAP) / visibleCount,
    ),
  );
  return { slotWidth, visibleCount, showPager: !fitsAll };
}

function getLeftOffsetClass(isMobile: boolean, isCollapsed: boolean): string {
  if (isMobile) return 'left-5';
  if (isCollapsed) return 'left-[calc(var(--sidebar-width-icon)+1.25rem)]';
  return 'left-[calc(var(--sidebar-width)+1.25rem)]';
}

export default function ChatManager() {
  const [openChatWindows, setOpenChatWindows] = useAtom(openChatWindowsAtom);
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>(() =>
    openChatWindows.map(
      ({ name, type, strategy, graphEdges, minimized }, index) => ({
        id: `${name}-${Date.now()}-${index}`,
        name,
        type,
        strategy,
        graphEdges,
        minimized: minimized ?? false,
      }),
    ),
  );
  const [offset, setOffset] = useState(0);
  const [revealName, setRevealName] = useState<string | null>(null);
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const visibleRangeRef = useRef({ start: 0, count: 0 });
  const { state, isMobile } = useSidebar();

  useEffect(() => {
    setOpenChatWindows(
      chatWindows.map(({ name, type, strategy, graphEdges, minimized }) => ({
        name,
        type,
        strategy,
        graphEdges,
        minimized,
      })),
    );
  }, [chatWindows, setOpenChatWindows]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setAvailableWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleOpenChat = (event: CustomEvent) => {
      const { name, type, strategy, graphEdges } = event.detail;
      const id = `${name}-${Date.now()}`;

      setChatWindows(prev => {
        const existingChat = prev.find(chat => chat.name === name);
        if (existingChat) {
          if (!existingChat.minimized) return prev;
          return prev.map(chat =>
            chat.id === existingChat.id ? { ...chat, minimized: false } : chat,
          );
        }

        return [
          ...prev,
          { id, name, type, strategy, graphEdges, minimized: false },
        ];
      });
      setRevealName(name);
    };

    const handleToggleChat = (event: CustomEvent) => {
      const { name, type, strategy, graphEdges } = event.detail;

      setChatWindows(prev => {
        const index = prev.findIndex(chat => chat.name === name);
        const existingChat = index === -1 ? undefined : prev[index];
        const { start, count } = visibleRangeRef.current;
        const isVisible = index >= start && index < start + count;

        if (existingChat?.minimized) {
          return prev.map(chat =>
            chat.id === existingChat.id ? { ...chat, minimized: false } : chat,
          );
        }
        if (existingChat && !isVisible) return prev;
        if (existingChat) {
          return prev.filter(chat => chat.id !== existingChat.id);
        }
        const id = `${name}-${Date.now()}`;
        return [
          ...prev,
          { id, name, type, strategy, graphEdges, minimized: false },
        ];
      });
      setRevealName(name);
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

  const { slotWidth, visibleCount, showPager } = getChatBarLayout(
    chatWindows.length,
    availableWidth,
  );
  const maxOffset = Math.max(0, chatWindows.length - visibleCount);
  const currentOffset = Math.min(offset, maxOffset);

  useEffect(() => {
    visibleRangeRef.current = { start: currentOffset, count: visibleCount };
  }, [currentOffset, visibleCount]);

  useEffect(() => {
    if (revealName === null) return;
    const index = chatWindows.findIndex(chat => chat.name === revealName);
    setRevealName(null);
    if (index === -1) return;
    if (index < currentOffset) {
      setOffset(index);
    } else if (index >= currentOffset + visibleCount) {
      setOffset(index - visibleCount + 1);
    } else {
      return;
    }
    setFocusTargetId(chatWindows[index].id);
  }, [revealName, chatWindows, visibleCount, currentOffset]);

  useEffect(() => {
    if (focusTargetId === null) return;
    const slot = slotRefs.current.get(focusTargetId);
    setFocusTargetId(null);
    const target =
      slot?.querySelector<HTMLElement>('textarea:not(:disabled)') ??
      slot?.querySelector<HTMLElement>('button');
    target?.focus();
  }, [focusTargetId]);

  const pageTo = (nextOffset: number, focusIndex: number) => {
    setOffset(nextOffset);
    setFocusTargetId(chatWindows[focusIndex].id);
  };

  const handleCloseChat = useCallback((id: string) => {
    setChatWindows(prev => prev.filter(chat => chat.id !== id));
  }, []);

  const handleMinimizedChange = useCallback(
    (id: string, minimized: boolean) => {
      setChatWindows(prev =>
        prev.map(chat => (chat.id === id ? { ...chat, minimized } : chat)),
      );
    },
    [],
  );

  const trackWidth =
    visibleCount * slotWidth + Math.max(0, visibleCount - 1) * SLOT_GAP;

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-none fixed right-5 bottom-5 z-50 flex items-end justify-end gap-2 transition-[left] duration-800 ease-[cubic-bezier(0.25,1.2,0.5,1)]',
        getLeftOffsetClass(isMobile, state === 'collapsed'),
      )}>
      {chatWindows.length > 0 && (
        <div className="overflow-clip" style={{ width: trackWidth }}>
          <div
            className="flex items-end gap-2 transition-[margin] duration-300"
            style={{ marginLeft: -currentOffset * (slotWidth + SLOT_GAP) }}>
            {chatWindows.map((chat, index) => (
              <div
                key={chat.id}
                ref={node => {
                  if (node) slotRefs.current.set(chat.id, node);
                  else slotRefs.current.delete(chat.id);
                }}
                inert={
                  index < currentOffset || index >= currentOffset + visibleCount
                }
                className="pointer-events-auto shrink-0"
                style={{ width: slotWidth }}>
                <FloatingChat
                  id={chat.id}
                  name={chat.name}
                  type={chat.type}
                  strategy={chat.strategy}
                  graphEdges={chat.graphEdges}
                  minimized={chat.minimized}
                  onMinimizedChange={handleMinimizedChange}
                  onClose={handleCloseChat}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {showPager && (
        <>
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            aria-label="Previous chats"
            disabled={currentOffset === 0}
            onClick={() => {
              const nextOffset = Math.max(0, currentOffset - 1);
              pageTo(nextOffset, nextOffset);
            }}>
            <IconShell size="sm">
              <ArrowBack />
            </IconShell>
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            aria-label="Next chats"
            disabled={currentOffset >= maxOffset}
            onClick={() => {
              const nextOffset = Math.min(maxOffset, currentOffset + 1);
              pageTo(nextOffset, nextOffset + visibleCount - 1);
            }}>
            <IconShell size="sm">
              <ArrowForward />
            </IconShell>
          </Button>
        </>
      )}
    </div>
  );
}
