'use client';

import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  TimerOff,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

interface ToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

interface ApprovalToolCardProps {
  readonly toolCall: ToolCall;
  readonly showButtons: boolean;
  readonly isSubmitting: boolean;
  readonly timeout?: string;
  readonly decision?: 'approved' | 'rejected' | null;
  readonly expired?: boolean;
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
}

function ApprovalToolCard({
  toolCall,
  showButtons,
  isSubmitting,
  timeout,
  decision,
  expired,
  onApprove,
  onReject,
}: ApprovalToolCardProps) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  let parsedArgs: Record<string, unknown> | null = null;
  let parseArgsError = false;

  try {
    if (toolCall.function?.arguments) {
      parsedArgs = JSON.parse(toolCall.function.arguments) as Record<
        string,
        unknown
      >;
    }
  } catch {
    parseArgsError = true;
  }

  let cardClassName =
    'bg-card border-border rounded-lg border p-3 text-sm shadow-sm';
  if (decision === 'rejected') {
    cardClassName =
      'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 rounded-lg border p-3 text-sm shadow-sm';
  } else if (expired && !decision) {
    cardClassName =
      'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 rounded-lg border p-3 text-sm shadow-sm';
  }

  return (
    <div className={cardClassName}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Wrench className="text-muted-foreground h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">
          {toolCall.function?.name || toolCall.type}
        </span>
        {timeout && !expired && (
          <div className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
            <Clock className="size-3" />
            <span>{timeout}</span>
          </div>
        )}
        {expired && !decision && (
          <div className="ml-auto flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <TimerOff className="size-3" />
            <span>Approval expired — agent may retry</span>
          </div>
        )}
      </div>

      <div className="mt-2">
        <button
          onClick={() => setIsInputExpanded(!isInputExpanded)}
          className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors">
          {isInputExpanded ? (
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
          )}
          <span className="text-muted-foreground text-xs font-medium">
            Input
          </span>
        </button>
        {isInputExpanded && (
          <div className="mt-1 px-2">
            {parseArgsError ? (
              <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                {toolCall.function?.arguments || '{}'}
              </pre>
            ) : (
              <pre className="bg-muted overflow-x-auto rounded-md p-2 text-xs">
                {JSON.stringify(parsedArgs, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {showButtons && !isSubmitting && (
        <div className="border-border mt-3 flex items-center gap-2 border-t pt-3">
          <Button
            onClick={onApprove}
            disabled={isSubmitting}
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700">
            <CheckCircle className="mr-1.5 size-3.5" />
            Approve
          </Button>
          <Button
            onClick={onReject}
            disabled={isSubmitting}
            size="sm"
            variant="destructive">
            <XCircle className="mr-1.5 size-3.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

interface ApprovalNotificationProps {
  readonly queryName: string;
  readonly queryNamespace: string;
  readonly taskId: string;
  readonly toolCalls: ToolCall[];
  readonly timeout?: string;
  readonly onTimeout?: string;
  readonly agentName?: string;
  readonly existingDecision?: 'approved' | 'rejected' | null;
  readonly expired?: boolean;
  readonly expiresAtMs?: number;
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
  // Called once when the approval expires without user action. Lets callers
  // start polling for the agent's retry attempt so a cascading approval is
  // surfaced rather than leaving the user looking at a stale "expired" badge.
  readonly onExpired?: () => Promise<void> | void;
}

export function ApprovalNotification({
  toolCalls,
  timeout,
  existingDecision = null,
  expired: expiredProp = false,
  expiresAtMs,
  onApprove,
  onReject,
  onExpired,
}: ApprovalNotificationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(
    existingDecision,
  );
  const [expired, setExpired] = useState<boolean>(expiredProp);
  const onExpiredCalled = useRef(false);
  const triggerOnExpired = useCallback(() => {
    if (onExpiredCalled.current || !onExpired) return;
    onExpiredCalled.current = true;
    try {
      const ret = onExpired();
      if (ret && typeof (ret as Promise<void>).catch === 'function') {
        (ret as Promise<void>).catch(err =>
          console.error('onExpired callback failed:', err),
        );
      }
    } catch (err) {
      console.error('onExpired callback threw:', err);
    }
  }, [onExpired]);

  useEffect(() => {
    if (existingDecision && !decision) {
      setDecision(existingDecision);
    }
  }, [existingDecision, decision]);

  useEffect(() => {
    setExpired(expiredProp);
    if (expiredProp && !decision) {
      triggerOnExpired();
    }
  }, [expiredProp, decision, triggerOnExpired]);

  // Schedule a re-render exactly when the approval expires so the UI flips
  // without waiting for the next poll.
  useEffect(() => {
    if (expired || decision || !expiresAtMs) return;
    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      setExpired(true);
      triggerOnExpired();
      return;
    }
    const timer = setTimeout(() => {
      setExpired(true);
      triggerOnExpired();
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAtMs, expired, decision, triggerOnExpired]);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove();
      setDecision('approved');
    } catch (error) {
      console.error('Failed to approve:', error);
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject();
      setDecision('rejected');
    } catch (error) {
      console.error('Failed to reject:', error);
      setIsSubmitting(false);
    }
  };

  if (decision) {
    return (
      <div className="space-y-2">
        {toolCalls.map(toolCall => (
          <ApprovalToolCard
            key={toolCall.id}
            toolCall={toolCall}
            showButtons={false}
            isSubmitting={false}
            decision={decision}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </div>
    );
  }

  const buttonsAllowed = !expired;
  return (
    <div className="space-y-2">
      {toolCalls.map((toolCall, index) => (
        <ApprovalToolCard
          key={toolCall.id}
          toolCall={toolCall}
          showButtons={buttonsAllowed && index === toolCalls.length - 1}
          isSubmitting={isSubmitting}
          timeout={index === 0 ? timeout : undefined}
          decision={null}
          expired={expired}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  );
}
