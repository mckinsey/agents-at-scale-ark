import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';
import { ApprovalNotification } from '@/components/sessions-conversations/approval-notification';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { submitApproval } from '@/lib/services/query-approvals';
import type { ToolApprovalRequest } from '@/lib/types/chat-message';
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
  approvalRequest?: ToolApprovalRequest;
  namespace?: string;
  pollAfterApproval?: () => Promise<void>;
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
  const markdownContent = renderMarkdown(content);
  const { push } = useNamespacedNavigation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState<number | null>(null);

  const showErrorIcon = isFailed && queryName;

  // Track submitted task decisions in sessionStorage to persist across refreshes
  const getSubmittedTaskDecisions = (): Map<string, 'approved' | 'rejected'> => {
    if (typeof window === 'undefined') return new Map();
    const stored = sessionStorage.getItem('submitted-approval-tasks');
    if (!stored) return new Map();
    try {
      const obj = JSON.parse(stored);
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  };

  const addSubmittedTaskDecision = (taskId: string, decision: 'approved' | 'rejected') => {
    if (typeof window === 'undefined') return;
    const submitted = getSubmittedTaskDecisions();
    submitted.set(taskId, decision);
    const obj = Object.fromEntries(submitted);
    sessionStorage.setItem('submitted-approval-tasks', JSON.stringify(obj));
  };

  const taskDecision = approvalRequest?.taskId ? getSubmittedTaskDecisions().get(approvalRequest.taskId) : undefined;
  const [approvalDecision, setApprovalDecision] = useState<'approved' | 'rejected' | null>(taskDecision || null);

  const handleApprove = async () => {
    if (!queryName) return;
    console.log('[HITL Debug] Submitting approval for query:', queryName);
    if (approvalRequest?.taskId) {
      addSubmittedTaskDecision(approvalRequest.taskId, 'approved');
    }
    await submitApproval(queryName, namespace, 'approved');
    setApprovalDecision('approved');
    console.log('[HITL Debug] Approval submitted, starting polling');
    if (pollAfterApproval) {
      await pollAfterApproval();
    }
  };

  const handleReject = async () => {
    if (!queryName) return;
    console.log('[HITL Debug] Submitting rejection for query:', queryName);
    if (approvalRequest?.taskId) {
      addSubmittedTaskDecision(approvalRequest.taskId, 'rejected');
    }
    await submitApproval(queryName, namespace, 'rejected');
    setApprovalDecision('rejected');
    console.log('[HITL Debug] Rejection submitted, starting polling');
    if (pollAfterApproval) {
      await pollAfterApproval();
    }
  };

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

  if (approvalRequest) {
    console.log('[HITL Debug] ChatMessage rendering approval request:', approvalRequest);
    console.log('[HITL Debug] ChatMessage queryName:', queryName);
    console.log('[HITL Debug] ChatMessage namespace:', namespace);

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
          existingDecision={approvalDecision}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      </div>
    );
  }

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
          <div className="flex flex-col gap-2">
            {sender && !isUser && (
              <div className="text-muted-foreground text-xs font-medium">
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
                  className="hover:bg-destructive/20 flex-shrink-0 rounded p-1 transition-colors"
                  title="View events for this query">
                  <AlertCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isUser && tokenUsage && tokenUsage.total_tokens > 0 && (
              <div className="text-muted-foreground text-xs opacity-60">
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
