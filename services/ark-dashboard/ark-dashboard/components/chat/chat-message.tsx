import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';
import { ApprovalNotification } from '@/components/sessions-conversations/approval-notification';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { Warning } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { submitApproval } from '@/lib/services/a2a-task-approvals';
import type { ToolApprovalRequest } from '@/lib/types/chat-message';
import { cn } from '@/lib/utils';
import { getResourceEventsUrl } from '@/lib/utils/events';
import { parseDurationToMs } from '@/lib/utils/time';

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
  approvalRequest?: ToolApprovalRequest;
  namespace?: string;
  pollAfterApproval?: () => Promise<void>;
}

type ApprovalDecision = 'approved' | 'rejected';

function getSubmittedTaskDecisions(): Map<string, ApprovalDecision> {
  if (globalThis.window === undefined) return new Map();
  const stored = sessionStorage.getItem('submitted-approval-tasks');
  if (!stored) return new Map();
  try {
    const obj = JSON.parse(stored);
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function addSubmittedTaskDecision(
  taskId: string,
  decision: ApprovalDecision,
): void {
  if (globalThis.window === undefined) return;
  const submitted = getSubmittedTaskDecisions();
  submitted.set(taskId, decision);
  const obj = Object.fromEntries(submitted);
  sessionStorage.setItem('submitted-approval-tasks', JSON.stringify(obj));
}

function findScrollableElements(element: Element): Element[] {
  const scrollable: Element[] = [];
  const style = globalThis.getComputedStyle(element);

  if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
    scrollable.push(element);
  }

  for (const child of Array.from(element.children)) {
    scrollable.push(...findScrollableElements(child));
  }

  return scrollable;
}

function useContentExpansion(content: string, markdownContent: ReactNode) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null);

  useEffect(() => {
    const checkContentWidth = () => {
      if (!contentRef.current) return;

      const container = contentRef.current;

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

  return { contentRef, needsExpansion, expandedWidth };
}

function ApprovalMessage({
  approvalRequest,
  isUser,
  className,
  queryName,
  namespace,
  pollAfterApproval,
}: Readonly<{
  approvalRequest: ToolApprovalRequest;
  isUser: boolean;
  className?: string;
  queryName?: string;
  namespace: string;
  pollAfterApproval?: () => Promise<void>;
}>) {
  const taskDecision = approvalRequest.taskId
    ? getSubmittedTaskDecisions().get(approvalRequest.taskId)
    : undefined;
  const [approvalDecision, setApprovalDecision] = useState<
    'approved' | 'rejected' | null
  >(taskDecision || null);

  const approvalExpiresAtMs = useMemo(() => {
    if (!approvalRequest.timeout || !approvalRequest.receivedAtMs) {
      return undefined;
    }
    const timeoutMs = parseDurationToMs(approvalRequest.timeout);
    if (timeoutMs === null) return undefined;
    return approvalRequest.receivedAtMs + timeoutMs;
  }, [approvalRequest.timeout, approvalRequest.receivedAtMs]);

  const handleApprove = async () => {
    if (!approvalRequest.taskId) return;
    addSubmittedTaskDecision(approvalRequest.taskId, 'approved');
    await submitApproval(
      `a2a-task-${approvalRequest.taskId}`,
      namespace,
      'approved',
    );
    setApprovalDecision('approved');
    if (pollAfterApproval) {
      await pollAfterApproval();
    }
  };

  const handleReject = async () => {
    if (!approvalRequest.taskId) return;
    addSubmittedTaskDecision(approvalRequest.taskId, 'rejected');
    await submitApproval(
      `a2a-task-${approvalRequest.taskId}`,
      namespace,
      'rejected',
    );
    setApprovalDecision('rejected');
    if (pollAfterApproval) {
      await pollAfterApproval();
    }
  };

  // Generate a unique key from tool call IDs to reset component state on new approvals
  const approvalKey = approvalRequest.toolCalls.map(tc => tc.id).join('-');
  return (
    <div
      className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'} ${className || ''}`}>
      <ApprovalNotification
        key={approvalKey}
        queryName={queryName || ''}
        queryNamespace={namespace}
        taskId={approvalRequest.taskId}
        toolCalls={approvalRequest.toolCalls}
        timeout={approvalRequest.timeout}
        onTimeout={approvalRequest.onTimeout}
        agentName={approvalRequest.agentName}
        expiresAtMs={approvalExpiresAtMs}
        existingDecision={approvalDecision}
        onApprove={handleApprove}
        onReject={handleReject}
        onExpired={pollAfterApproval}
      />
    </div>
  );
}

function ToolCallsOnlyMessage({
  toolCalls,
  isUser,
  className,
}: Readonly<{
  toolCalls: ToolCallData[];
  isUser: boolean;
  className?: string;
}>) {
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

function MessageBubbleContent({
  isUser,
  isFailed,
  content,
  markdownContent,
  viewMode,
  sender,
  tokenUsage,
  queryName,
  contentRef,
}: Readonly<{
  isUser: boolean;
  isFailed: boolean;
  content: string;
  markdownContent: ReactNode;
  viewMode: 'text' | 'markdown';
  sender?: string;
  tokenUsage?: ChatMessageProps['tokenUsage'];
  queryName?: string;
  contentRef: RefObject<HTMLDivElement | null>;
}>) {
  const { push } = useNamespacedNavigation();
  const showErrorIcon = isFailed && queryName;

  const handleErrorIconClick = () => {
    if (queryName) {
      const eventsUrl = getResourceEventsUrl('Query', queryName);
      push(eventsUrl);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {sender && !isUser && (
        <div className="text-fg-tertiary text-xs font-medium">{sender}</div>
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
  );
}

function StandardMessage({
  isUser,
  isFailed,
  content,
  viewMode,
  sender,
  tokenUsage,
  queryName,
  toolCalls,
  className,
}: Readonly<{
  isUser: boolean;
  isFailed: boolean;
  content: string;
  viewMode: 'text' | 'markdown';
  sender?: string;
  tokenUsage?: ChatMessageProps['tokenUsage'];
  queryName?: string;
  toolCalls?: ToolCallData[];
  className?: string;
}>) {
  const markdownContent = renderMarkdown(content);
  const { contentRef, needsExpansion, expandedWidth } = useContentExpansion(
    content,
    markdownContent,
  );

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const alignClass = isUser ? 'items-end' : 'items-start';
  const bubbleWidthClass = needsExpansion ? '' : 'max-w-[80%]';
  const bubbleStyle =
    needsExpansion && expandedWidth
      ? { minWidth: `${expandedWidth}px` }
      : undefined;

  let bubbleClass = 'bg-surface-bg-secondary text-fg-primary';
  if (isUser) {
    bubbleClass = 'bg-surface-bg-tertiary text-fg-primary';
  } else if (isFailed) {
    bubbleClass = 'bg-status-error/10 text-status-error';
  }

  return (
    <div
      data-testid="chat-message"
      className={cn('flex flex-col gap-2', alignClass, className)}>
      {hasContent && (
        <div
          className={cn('px-3 py-2', bubbleWidthClass, bubbleClass)}
          style={bubbleStyle}>
          <MessageBubbleContent
            isUser={isUser}
            isFailed={isFailed}
            content={content}
            markdownContent={markdownContent}
            viewMode={viewMode}
            sender={sender}
            tokenUsage={tokenUsage}
            queryName={queryName}
            contentRef={contentRef}
          />
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
  approvalRequest,
  namespace = 'default',
  pollAfterApproval,
}: Readonly<ChatMessageProps>) {
  const isUser = role === 'user';
  const isFailed = status === 'failed';

  if (approvalRequest) {
    return (
      <ApprovalMessage
        approvalRequest={approvalRequest}
        isUser={isUser}
        className={className}
        queryName={queryName}
        namespace={namespace}
        pollAfterApproval={pollAfterApproval}
      />
    );
  }

  const hasContent = content && content.trim().length > 0;
  const hasToolCalls = toolCalls && toolCalls.length > 0;

  if (!hasContent && hasToolCalls) {
    return (
      <ToolCallsOnlyMessage
        toolCalls={toolCalls ?? []}
        isUser={isUser}
        className={className}
      />
    );
  }

  return (
    <StandardMessage
      isUser={isUser}
      isFailed={isFailed}
      content={content}
      viewMode={viewMode}
      sender={sender}
      tokenUsage={tokenUsage}
      queryName={queryName}
      toolCalls={toolCalls}
      className={className}
    />
  );
}
