import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 100;

interface UseStickyScrollReturn {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  scrollToBottom: () => void;
  resumeAutoScroll: () => void;
}

export function useStickyScroll(): UseStickyScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current =
      distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  const resumeAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = true;
  }, []);

  return {
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    resumeAutoScroll,
  };
}
