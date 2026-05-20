'use client';

import { useState } from 'react';
import { Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ToolCall {
  id: string;
  type: string;
  function?: {
    name: string;
    arguments: string;
  };
}

interface ApprovalNotificationProps {
  readonly queryName: string;
  readonly queryNamespace: string;
  readonly toolCalls: ToolCall[];
  readonly timeout?: string;
  readonly onTimeout?: string;
  readonly agentName?: string;
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
}

export function ApprovalNotification({
  queryName,
  queryNamespace,
  toolCalls,
  timeout,
  onTimeout,
  agentName,
  onApprove,
  onReject
}: ApprovalNotificationProps) {
  console.log('[HITL Debug] ApprovalNotification rendering with props:', {
    queryName,
    queryNamespace,
    toolCalls,
    timeout,
    onTimeout,
    agentName,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'reject' | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setSubmittingAction('approve');
    try {
      await onApprove();
      setDecision('approved');
    } catch (error) {
      console.error('Failed to approve:', error);
      setIsSubmitting(false);
      setSubmittingAction(null);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    setSubmittingAction('reject');
    try {
      await onReject();
      setDecision('rejected');
    } catch (error) {
      console.error('Failed to reject:', error);
      setIsSubmitting(false);
      setSubmittingAction(null);
    }
  };

  if (decision) {
    return (
      <div className={cn(
        'my-4 rounded-lg border p-4',
        decision === 'approved' ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950'
      )}>
        <div className="flex items-center gap-2">
          {decision === 'approved' ? (
            <CheckCircle className="size-5 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="size-5 text-red-600 dark:text-red-400" />
          )}
          <span className={cn(
            'font-medium',
            decision === 'approved' ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'
          )}>
            Tool execution {decision}
          </span>
        </div>
      </div>
    );
  }

  console.log('[HITL Debug] ApprovalNotification rendering notification UI');

  return (
    <div className="my-4 rounded-lg border border-amber-500 bg-amber-50 dark:bg-amber-950 p-4" style={{ minHeight: '100px' }} data-testid="approval-notification">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                Approval Required
              </h3>
              {agentName && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Agent: {agentName}
                </p>
              )}
            </div>
          </div>
          {timeout && (
            <Badge variant="outline" className="flex items-center gap-1 border-amber-600 text-amber-900 dark:text-amber-100">
              <Clock className="size-3" />
              Timeout: {timeout}
              {onTimeout && ` (${onTimeout})`}
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            The following tool{toolCalls.length > 1 ? 's' : ''} require{toolCalls.length === 1 ? 's' : ''} your approval:
          </p>
          <div className="space-y-2">
            {toolCalls.map((toolCall) => (
              <div
                key={toolCall.id}
                className="rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/20 p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-amber-900 dark:text-amber-100">
                        {toolCall.function?.name || toolCall.type}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {toolCall.type}
                      </Badge>
                    </div>
                    {toolCall.function?.arguments && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100">
                          View arguments
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded bg-amber-100 dark:bg-amber-900/40 p-2 text-amber-900 dark:text-amber-100">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2);
                            } catch (error) {
                              console.error('[HITL Debug] Failed to parse tool call arguments:', error, toolCall.function.arguments);
                              return toolCall.function.arguments;
                            }
                          })()}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isSubmitting ? (
          <div className="flex justify-start pt-2">
            <div className={cn(
              "rounded-lg px-3 py-2",
              submittingAction === 'approve'
                ? "bg-green-100 dark:bg-green-900/40"
                : "bg-red-100 dark:bg-red-900/40"
            )}>
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className={cn(
                    "size-2 animate-bounce rounded-full [animation-delay:-0.3s]",
                    submittingAction === 'approve'
                      ? "bg-green-600 dark:bg-green-400"
                      : "bg-red-600 dark:bg-red-400"
                  )}></div>
                  <div className={cn(
                    "size-2 animate-bounce rounded-full [animation-delay:-0.15s]",
                    submittingAction === 'approve'
                      ? "bg-green-600 dark:bg-green-400"
                      : "bg-red-600 dark:bg-red-400"
                  )}></div>
                  <div className={cn(
                    "size-2 animate-bounce rounded-full",
                    submittingAction === 'approve'
                      ? "bg-green-600 dark:bg-green-400"
                      : "bg-red-600 dark:bg-red-400"
                  )}></div>
                </div>
                <span className={cn(
                  "text-sm",
                  submittingAction === 'approve'
                    ? "text-green-900 dark:text-green-100"
                    : "text-red-900 dark:text-red-100"
                )}>
                  {submittingAction === 'approve' ? 'Approving and resuming execution...' : 'Rejecting and ending query...'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 size-4" />
              Approve
            </Button>
            <Button
              onClick={handleReject}
              disabled={isSubmitting}
              variant="destructive"
            >
              <XCircle className="mr-2 size-4" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
