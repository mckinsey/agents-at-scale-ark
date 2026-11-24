import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 100;

interface UseStickyScrollOptions {
  thresholdPx?: number;
  behavior?: ScrollBehavior;
}

interface UseStickyScrollReturn {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  scrollToBottom: () => void;
  resumeAutoScroll: () => void;
  isStickingToBottom: () => boolean;
  setStickToBottom: (value: boolean) => void;
}

export function useStickyScroll(
  options: UseStickyScrollOptions = {},
): UseStickyScrollReturn {
  const {
    thresholdPx = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
    behavior = 'instant',
  } = options;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= thresholdPx;
  }, [thresholdPx]);

  const scrollToBottom = useCallback(() => {
    if (!shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
  }, [behavior]);

  const resumeAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = true;
  }, []);

  const isStickingToBottom = useCallback(() => shouldAutoScrollRef.current, []);

  const setStickToBottom = useCallback((value: boolean) => {
    shouldAutoScrollRef.current = value;
  }, []);

  return {
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    resumeAutoScroll,
    isStickingToBottom,
    setStickToBottom,
  };
}
