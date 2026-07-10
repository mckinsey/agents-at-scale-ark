'use client';

import { ArrowRight, Check, Copy, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  ARGO_MAKE_AUTHOR_AGENT_NAME,
  ARGO_MAKE_AUTHOR_INSTALL_CMD,
} from '@/lib/constants/argo-make';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

interface StudioChatGateProps {
  agentMissing: boolean;
  mcpMissing: boolean;
}

interface StepBadgeProps {
  number: number;
}

function StepBadge({ number }: StepBadgeProps) {
  return (
    <span className="bg-muted text-muted-foreground mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs">
      {number}
    </span>
  );
}

interface InstallAgentStepProps {
  number: number;
}

function InstallAgentStep({ number }: InstallAgentStepProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(ARGO_MAKE_AUTHOR_INSTALL_CMD);
    setCopied(true);
    toast.success('Install command copied to clipboard.');
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li className="flex items-start gap-2.5" data-testid="studio-gate-step-agent">
      <StepBadge number={number} />
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-foreground text-sm">
          Install the {ARGO_MAKE_AUTHOR_AGENT_NAME} agent
        </p>
        <div className="bg-muted flex items-start gap-2 border p-2">
          <code className="text-foreground min-w-0 flex-1 break-all font-mono text-xs">
            {ARGO_MAKE_AUTHOR_INSTALL_CMD}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void copy()}
            aria-label="Copy install command"
            data-testid="studio-gate-copy">
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </li>
  );
}

interface AddMcpStepProps {
  number: number;
}

function AddMcpStep({ number }: AddMcpStepProps) {
  const { push } = useNamespacedNavigation();

  return (
    <li className="flex items-start gap-2.5" data-testid="studio-gate-step-mcp">
      <StepBadge number={number} />
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-foreground text-sm">Add the Kubernetes MCP server</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => push('/mcp')}
          data-testid="studio-gate-go-to-mcps">
          Go to MCPs
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

export function StudioChatGate({
  agentMissing,
  mcpMissing,
}: StudioChatGateProps) {
  let stepNumber = 0;

  return (
    <div
      className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-6 backdrop-blur-sm"
      data-testid="studio-chat-gate">
      <div className="bg-popover flex max-w-xs flex-col items-center gap-3 border p-6 text-center shadow-lg">
        <Lock className="text-muted-foreground h-7 w-7" />
        <p className="text-foreground text-base font-semibold">
          Chat with the agent is locked
        </p>
        <p className="text-muted-foreground text-sm">
          Set up this namespace to start chatting with the builder agent:
        </p>
        <ol className="flex w-full flex-col gap-4 text-left">
          {agentMissing && <InstallAgentStep number={++stepNumber} />}
          {mcpMissing && <AddMcpStep number={++stepNumber} />}
        </ol>
      </div>
    </div>
  );
}
