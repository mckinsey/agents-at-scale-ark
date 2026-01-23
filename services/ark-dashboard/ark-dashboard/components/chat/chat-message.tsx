import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';
import { useMarkdownProcessor } from '@/lib/hooks/use-markdown-processor';
import { getResourceEventsUrl } from '@/lib/utils/events';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  queryName?: string;
  className?: string;
  viewMode?: 'text' | 'markdown';
  toolCalls?: ToolCallData[];
}

export function ChatMessage({
  role,
  content,
  status,
  className,
  viewMode = 'text',
  queryName,
  toolCalls,
}: Readonly<ChatMessageProps>) {
  const isUser = role === 'user';
  const isFailed = status === 'failed';
  const markdownContent = useMarkdownProcessor(content);
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null);

  const showErrorIcon = isFailed && queryName;

  const handleErrorIconClick = () => {
    if (queryName) {
      const eventsUrl = getResourceEventsUrl('Query', queryName);
      router.push(eventsUrl);
    }
  };

  useEffect(() => {
    const checkContentWidth = () => {
      if (!contentRef.current) return;

      const container = contentRef.current;

      const findScrollableElements = (element: Element): Element[] => {
        const scrollable: Element[] = [];
        const style = window.getComputedStyle(element);

        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          scrollable.push(element);
        }

        for (const child of Array.from(element.children)) {
          scrollable.push(...findScrollableElements(child));
        }

        return scrollable;
      };

      const scrollableElements = findScrollableElements(container);

      const viewportWidth = window.innerWidth;
      const containerScrollWidth = container.scrollWidth;
      const containerClientWidth = container.clientWidth;

      const maxScrollWidth =
        scrollableElements.length > 0
          ? Math.max(
              ...scrollableElements.map(el => el.scrollWidth),
              containerScrollWidth,
            )
          : containerScrollWidth;

      const hasHorizontalScroll =
        containerScrollWidth > containerClientWidth ||
        scrollableElements.length > 0;

      if (!hasHorizontalScroll && maxScrollWidth <= viewportWidth * 0.8) {
        setNeedsExpansion(false);
        setExpandedWidth(null);
        return;
      }

      const bubblePadding = 24;
      const requiredWidth = maxScrollWidth + bubblePadding;
      const needsExpansionValue = requiredWidth > viewportWidth * 0.8;

      setNeedsExpansion(needsExpansionValue);

      if (needsExpansionValue) {
        setExpandedWidth(requiredWidth);
      } else {
        setExpandedWidth(null);
      }
    };

    const timeoutId = setTimeout(checkContentWidth, 0);

    const resizeObserver = new ResizeObserver(() => {
      checkContentWidth();
    });

    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    const mutationObserver = new MutationObserver(() => {
      checkContentWidth();
    });

    if (contentRef.current) {
      mutationObserver.observe(contentRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    window.addEventListener('resize', checkContentWidth);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', checkContentWidth);
    };
  }, [content, markdownContent]);

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;

  if (!hasContent && hasToolCalls) {
    return (
      <div
        className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`}>
        {toolCalls.map(toolCall => (
          <ToolCall key={toolCall.id} toolCall={toolCall} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`}>
      {hasContent && (
        <div
          className={`${needsExpansion ? '' : 'max-w-[80%]'} rounded-lg px-3 py-2 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : isFailed
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted'
          }`}
          style={
            needsExpansion && expandedWidth
              ? { minWidth: `${expandedWidth}px` }
              : undefined
          }>
          <div className="flex items-center gap-2">
            <div ref={contentRef} className="min-w-0 flex-1 overflow-x-auto">
              {viewMode === 'markdown' ? (
                <div className="text-sm break-words">{markdownContent}</div>
              ) : (
                <pre className="m-0 border-0 bg-transparent p-0 font-mono text-sm whitespace-pre-wrap">
                  {content}
                </pre>
              )}
            </div>
            {showErrorIcon && (
              <button
                onClick={handleErrorIconClick}
                className="hover:bg-destructive/20 flex-shrink-0 rounded p-1 transition-colors"
                title="View events for this query">
                <AlertCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {hasToolCalls && (
        <div className="flex w-full max-w-[80%] flex-col gap-3">
          {toolCalls.map(toolCall => (
            <ToolCall key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  );
}
