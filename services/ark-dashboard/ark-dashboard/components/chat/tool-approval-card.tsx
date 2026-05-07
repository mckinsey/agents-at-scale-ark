'use client';

import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toolApprovalsService, type ToolCallInfo } from '@/lib/services';

interface ToolApprovalCardProps {
  approvalName: string;
  namespace: string;
  toolCalls: ToolCallInfo[];
  reasonRequired?: boolean;
  onDecision: (approved: boolean) => void;
}

export function ToolApprovalCard({
  approvalName,
  namespace,
  toolCalls,
  reasonRequired = false,
  onDecision,
}: ToolApprovalCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await toolApprovalsService.approve(approvalName, reason || undefined, namespace);
      onDecision(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (reasonRequired && !reason.trim()) {
      setError('A reason is required when rejecting');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await toolApprovalsService.reject(approvalName, reason || undefined, namespace);
      onDecision(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-yellow-500/50 bg-yellow-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Tool Approval Required</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          The agent wants to execute the following tool{toolCalls.length > 1 ? 's' : ''}:
        </p>
        <div className="space-y-3">
          {toolCalls.map((tc, idx) => (
            <div
              key={tc.id || idx}
              className="bg-muted/50 rounded-md border p-3"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{tc.name}</span>
                <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs">
                  {tc.type}
                </span>
              </div>
              {tc.description && (
                <p className="text-muted-foreground mt-1 text-sm">{tc.description}</p>
              )}
              <div className="mt-2">
                <div className="text-muted-foreground mb-1 text-xs">Arguments:</div>
                <pre className="bg-background overflow-x-auto rounded border p-2 text-xs">
                  {formatArguments(tc.arguments)}
                </pre>
              </div>
              {tc.agentReasoning && (
                <div className="mt-2">
                  <div className="text-muted-foreground mb-1 text-xs">Agent reasoning:</div>
                  <p className="text-sm italic">{tc.agentReasoning}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-muted-foreground text-sm">
            Reason {reasonRequired ? '(required for rejection)' : '(optional)'}:
          </label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Enter a reason for your decision..."
            className="min-h-[60px] resize-none"
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <div className="text-sm text-red-500">{error}</div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReject}
          disabled={isSubmitting}
          className="gap-1"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          Reject
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleApprove}
          disabled={isSubmitting}
          className="gap-1"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatArguments(args: string): string {
  try {
    const parsed = JSON.parse(args);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return args;
  }
}
