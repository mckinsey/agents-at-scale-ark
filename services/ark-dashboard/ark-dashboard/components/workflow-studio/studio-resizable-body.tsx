'use client';

import { type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useRef, useState } from 'react';

interface StudioResizableBodyProps {
  chat: ReactNode;
  canvas: ReactNode;
}

const MIN_CHAT_WIDTH = 320;
const MIN_CANVAS_WIDTH = 400;
const DEFAULT_CHAT_FRACTION = 0.4;
const KEYBOARD_STEP = 16;
const KEYBOARD_STEP_LARGE = 48;

function clampChatWidth(raw: number, containerWidth: number): number {
  const max = Math.max(MIN_CHAT_WIDTH, containerWidth - MIN_CANVAS_WIDTH);
  return Math.min(Math.max(raw, MIN_CHAT_WIDTH), max);
}

export function StudioResizableBody({ chat, canvas }: StudioResizableBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [chatWidth, setChatWidth] = useState<number | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setChatWidth(clampChatWidth(event.clientX - rect.left, rect.width));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const current = chatWidth ?? rect.width * DEFAULT_CHAT_FRACTION;
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setChatWidth(clampChatWidth(current - step, rect.width));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setChatWidth(clampChatWidth(current + step, rect.width));
    }
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div
        className="border-stroke-divider flex min-w-0 shrink-0 flex-col border-r"
        style={{ width: chatWidth === null ? '40%' : `${chatWidth}px` }}
        data-testid="studio-chat-slot">
        {chat}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        tabIndex={0}
        data-testid="studio-resize-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none">
        <span className="bg-stroke-divider group-hover:bg-stroke-active group-focus-visible:bg-stroke-active h-10 w-0.5 transition-colors" />
      </div>

      <div className="bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {canvas}
      </div>
    </div>
  );
}
