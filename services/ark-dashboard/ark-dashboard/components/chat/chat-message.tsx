import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
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
  sender?: string;
  timestamp?: string;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function findScrollableElements(element: Element): Element[] {
  const scrollable: Element[] = [];
  const style = window.getComputedStyle(element);

  if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
    scrollable.push(element);
  }

  for (const child of Array.from(element.children)) {
    scrollable.push(...findScrollableElements(child));
  }

  return scrollable;
}

function calculateExpansionNeeds(
  container: HTMLDivElement,
  scrollableElements: Element[],
  viewportWidth: number
): { needsExpansion: boolean; expandedWidth: number | null } {
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
    return { needsExpansion: false, expandedWidth: null };
  }

  const bubblePadding = 24;
  const requiredWidth = maxScrollWidth + bubblePadding;
  const needsExpansionValue = requiredWidth > viewportWidth * 0.8;

  return {
    needsExpansion: needsExpansionValue,
    expandedWidth: needsExpansionValue ? requiredWidth : null,
  };
}

function isLongContent(text: string): boolean {
  const lines = text.split('\n').length;
  return lines > 15 || text.length > 1000;
}

function getTruncatedContent(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= 15) {
    return text.slice(0, 1000);
  }
  return lines.slice(0, 15).join('\n');
}

function getMessageBubbleClasses(isUser: boolean, isFailed: boolean, needsExpansion: boolean): string {
  const maxWidth = needsExpansion ? '' : 'max-w-[80%]';
  const baseClasses = 'rounded-lg px-3 py-2';

  let bgClasses = 'bg-muted';
  if (isUser) {
    bgClasses = 'bg-primary text-primary-foreground';
  } else if (isFailed) {
    bgClasses = 'bg-destructive/10 text-destructive';
  }

  return `${maxWidth} ${baseClasses} ${bgClasses}`;
}

// ============================================================================
// Custom Hook for Content Expansion Logic
// ============================================================================

function useMessageExpansion(
  contentRef: React.RefObject<HTMLDivElement | null>,
  content: string,
  markdownContent: React.ReactNode
) {
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null);

  useEffect(() => {
    const checkContentWidth = () => {
      if (!contentRef.current) return;

      const container = contentRef.current;
      const scrollableElements = findScrollableElements(container);
      const viewportWidth = window.innerWidth;

      const { needsExpansion: needsExpansionValue, expandedWidth: expandedWidthValue } =
        calculateExpansionNeeds(container, scrollableElements, viewportWidth);

      setNeedsExpansion(needsExpansionValue);
      setExpandedWidth(expandedWidthValue);
    };

    const timeoutId = setTimeout(checkContentWidth, 0);
    const resizeObserver = new ResizeObserver(checkContentWidth);
    const mutationObserver = new MutationObserver(checkContentWidth);

    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
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
  }, [content, markdownContent, contentRef]);

  return { needsExpansion, expandedWidth };
}

// ============================================================================
// Sub-Components
// ============================================================================

function ErrorIconButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-destructive/20 flex-shrink-0 rounded p-1 transition-colors"
      title="View events for this query">
      <AlertCircle className="h-4 w-4" />
    </button>
  );
}

function ExpandToggleButton({
  isExpanded,
  onClick
}: Readonly<{
  isExpanded: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity">
      {isExpanded ? (
        <>
          <ChevronDown className="h-3 w-3" />
          Show less
        </>
      ) : (
        <>
          <ChevronRight className="h-3 w-3" />
          Show more
        </>
      )}
    </button>
  );
}

function TokenUsageDisplay({
  tokenUsage
}: Readonly<{
  tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}>) {
  return (
    <div className="text-muted-foreground text-xs opacity-60">
      {tokenUsage.total_tokens.toLocaleString()} tokens (
      {tokenUsage.prompt_tokens.toLocaleString()} in,{' '}
      {tokenUsage.completion_tokens.toLocaleString()} out)
    </div>
  );
}

function MessageContentDisplay({
  viewMode,
  displayContent,
  markdownContent,
  contentRef,
}: Readonly<{
  viewMode: 'text' | 'markdown';
  displayContent: string;
  markdownContent: React.ReactNode;
  contentRef: React.RefObject<HTMLDivElement | null>;
}>) {
  return (
    <div ref={contentRef} className="min-w-0 flex-1 overflow-x-auto">
      {viewMode === 'markdown' ? (
        <div className="text-sm break-words">{markdownContent}</div>
      ) : (
        <pre className="m-0 border-0 bg-transparent p-0 font-mono text-sm whitespace-pre-wrap">
          {displayContent}
        </pre>
      )}
    </div>
  );
}

function ToolCallsList({ toolCalls }: Readonly<{ toolCalls: ToolCallData[] }>) {
  return (
    <div className="flex w-full max-w-[80%] flex-col gap-3">
      {toolCalls.map(toolCall => (
        <ToolCall key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ChatMessage({
  role,
  content,
  status,
  className,
  viewMode = 'text',
  queryName,
  toolCalls,
  sender,
  timestamp,
  tokenUsage,
}: Readonly<ChatMessageProps>) {
  const isUser = role === 'user';
  const isFailed = status === 'failed';
  const { push } = useNamespacedNavigation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const contentIsLong = isLongContent(content);
  const displayContent = contentIsLong && !isContentExpanded
    ? getTruncatedContent(content)
    : content;

  const markdownContent = useMarkdownProcessor(displayContent);
  const { needsExpansion, expandedWidth } = useMessageExpansion(contentRef, content, markdownContent);

  const handleErrorIconClick = () => {
    if (queryName) {
      const eventsUrl = getResourceEventsUrl('Query', queryName);
      push(eventsUrl);
    }
  };

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const showErrorIcon = isFailed && queryName;
  const showTokenUsage = !isUser && tokenUsage && tokenUsage.total_tokens > 0;

  const containerClasses = `flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`;

  if (!hasContent && hasToolCalls) {
    return (
      <div className={containerClasses}>
        <ToolCallsList toolCalls={toolCalls} />
      </div>
    );
  }

  const bubbleStyle = needsExpansion && expandedWidth
    ? { minWidth: `${expandedWidth}px` }
    : undefined;

  return (
    <div className={containerClasses}>
      {hasContent && (
        <div
          className={getMessageBubbleClasses(isUser, isFailed, needsExpansion)}
          style={bubbleStyle}>
          <div className="flex flex-col gap-2">
            {sender && !isUser && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <span>{sender}</span>
                {timestamp && (
                  <span className="opacity-70">
                    {new Date(timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    })}
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <MessageContentDisplay
                  viewMode={viewMode}
                  displayContent={displayContent}
                  markdownContent={markdownContent}
                  contentRef={contentRef}
                />
                {showErrorIcon && (
                  <ErrorIconButton onClick={handleErrorIconClick} />
                )}
              </div>
              {contentIsLong && (
                <ExpandToggleButton
                  isExpanded={isContentExpanded}
                  onClick={() => setIsContentExpanded(!isContentExpanded)}
                />
              )}
            </div>
            {showTokenUsage && <TokenUsageDisplay tokenUsage={tokenUsage} />}
          </div>
        </div>
      )}

      {hasToolCalls && <ToolCallsList toolCalls={toolCalls} />}
    </div>
  );
}
