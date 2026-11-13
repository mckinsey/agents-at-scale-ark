'use client';

import {
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

const COLLAPSED_MAX_HEIGHT_PX = 260;

interface ExpandableMessageContentProps {
  enabled: boolean;
  children: ReactNode;
}

export function ExpandableMessageContent({
  enabled,
  children,
}: Readonly<ExpandableMessageContentProps>) {
  const contentId = useId();
  const innerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || !enabled) {
      setIsOverflowing(false);
      return;
    }
    const measure = () =>
      setIsOverflowing(inner.offsetHeight > COLLAPSED_MAX_HEIGHT_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [enabled]);

  const canToggle = enabled && isOverflowing;
  const isCollapsed = canToggle && !isExpanded;

  return (
    <div className="flex flex-col gap-2">
      <div
        id={contentId}
        className={cn(
          isCollapsed &&
            'max-h-65 overflow-y-clip mask-b-from-40 mask-b-to-100%',
        )}>
        <div ref={innerRef}>{children}</div>
      </div>
      {canToggle && (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setIsExpanded(prev => !prev)}
          className="text-fg-secondary hover:text-fg-primary paragraph-small-emphasised focus-visible:ring-stroke-status-focus self-start outline-none focus-visible:ring-1">
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
