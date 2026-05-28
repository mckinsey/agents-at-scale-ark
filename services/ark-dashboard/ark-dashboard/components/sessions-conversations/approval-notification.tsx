'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ToolCall as ToolCallComponent } from '@/components/chat/tool-call';

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
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
}

function ApprovalToolCard({
  toolCall,
  showButtons,
  isSubmitting,
  timeout,
  decision,
  onApprove,
  onReject,
}: ApprovalToolCardProps) {
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  let parsedArgs: Record<string, unknown> | null = null;
  let parseArgsError = false;

  try {
    if (toolCall.function?.arguments) {
      parsedArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    }
  } catch {
    parseArgsError = true;
  }

  const cardClassName = decision === 'rejected'
    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 rounded-lg border p-3 text-sm shadow-sm"
    : "bg-card border-border rounded-lg border p-3 text-sm shadow-sm";

  return (
    <div className={cardClassName}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Wrench className="text-muted-foreground h-4 w-4 flex-shrink-0" />
        <span className="font-semibold">{toolCall.function?.name || toolCall.type}</span>
        {timeout && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{timeout}</span>
          </div>
        )}
      </div>

      <div className="mt-2">
        <button
          onClick={() => setIsInputExpanded(!isInputExpanded)}
          className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
        >
          {isInputExpanded ? (
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
          )}
          <span className="text-muted-foreground text-xs font-medium">Input</span>
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
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Button
            onClick={onApprove}
            disabled={isSubmitting}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="mr-1.5 size-3.5" />
            Approve
          </Button>
          <Button
            onClick={onReject}
            disabled={isSubmitting}
            size="sm"
            variant="destructive"
          >
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
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
}

export function ApprovalNotification({
  queryName,
  queryNamespace,
  taskId,
  toolCalls,
  timeout,
  onTimeout,
  agentName,
  existingDecision = null,
  onApprove,
  onReject
}: ApprovalNotificationProps) {
  console.log('[HITL Debug] ApprovalNotification rendering with props:', {
    queryName,
    queryNamespace,
    taskId,
    toolCalls,
    timeout,
    onTimeout,
    agentName,
    existingDecision,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'reject' | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(existingDecision);

  // Update decision state when existingDecision changes (e.g., after async data loads)
  useEffect(() => {
    if (existingDecision && !decision) {
      console.log('[HITL Debug] existingDecision changed to:', existingDecision);
      setDecision(existingDecision);
    }
  }, [existingDecision, decision]);

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
    // Show the tool calls in read-only mode (without approve/reject buttons)
    return (
      <div className="space-y-2">
        {toolCalls.map((toolCall) => (
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

  console.log('[HITL Debug] ApprovalNotification rendering notification UI');

  return (
    <div className="space-y-2">
      {toolCalls.map((toolCall, index) => (
        <ApprovalToolCard
          key={toolCall.id}
          toolCall={toolCall}
          showButtons={index === toolCalls.length - 1}
          isSubmitting={isSubmitting}
          timeout={index === 0 ? timeout : undefined}
          decision={null}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </div>
  );
}
