import { useEffect, useRef, useState } from 'react';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';
import { Warning } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { cn } from '@/lib/utils';
import { getResourceEventsUrl } from '@/lib/utils/events';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  queryName?: string;
  className?: string;
  viewMode?: 'text' | 'markdown';
  toolCalls?: ToolCallData[];
  sender?: string;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function ChatMessage({
  role,
  content,
  status,
  className,
  viewMode = 'text',
  queryName,
  toolCalls,
  sender,
  tokenUsage,
}: Readonly<ChatMessageProps>) {
  const isUser = role === 'user';
  const isFailed = status === 'failed';
  const markdownContent = renderMarkdown(content);
  const { push } = useNamespacedNavigation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null);

  const showErrorIcon = isFailed && queryName;

  const handleErrorIconClick = () => {
    if (queryName) {
      const eventsUrl = getResourceEventsUrl('Query', queryName);
      push(eventsUrl);
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
        data-testid="chat-message"
        className={cn(
          'flex flex-col gap-2',
          isUser ? 'items-end' : 'items-start',
          className,
        )}>
        {toolCalls.map(toolCall => (
          <ToolCall key={toolCall.id} toolCall={toolCall} />
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="chat-message"
      className={cn(
        'flex flex-col gap-2',
        isUser ? 'items-end' : 'items-start',
        className,
      )}>
      {hasContent && (
        <div
          className={cn(
            'px-3 py-2',
            needsExpansion ? '' : 'max-w-[80%]',
            isUser
              ? 'bg-surface-bg-tertiary text-fg-primary'
              : isFailed
                ? 'bg-status-error/10 text-status-error'
                : 'bg-surface-bg-secondary text-fg-primary',
          )}
          style={
            needsExpansion && expandedWidth
              ? { minWidth: `${expandedWidth}px` }
              : undefined
          }>
          <div className="flex flex-col gap-2">
            {sender && !isUser && (
              <div className="text-fg-tertiary text-xs font-medium">
                {sender}
              </div>
            )}
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
                  className="text-status-error hover:bg-status-error/10 flex-shrink-0 p-1 transition-colors"
                  title="View events for this query">
                  <IconShell size="sm">
                    <Warning />
                  </IconShell>
                </button>
              )}
            </div>
            {!isUser && tokenUsage && tokenUsage.total_tokens > 0 && (
              <div className="text-fg-tertiary text-xs opacity-60">
                {tokenUsage.total_tokens.toLocaleString()} tokens (
                {tokenUsage.prompt_tokens.toLocaleString()} in,{' '}
                {tokenUsage.completion_tokens.toLocaleString()} out)
              </div>
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
