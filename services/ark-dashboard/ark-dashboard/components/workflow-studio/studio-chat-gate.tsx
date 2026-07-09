'use client';

import { Check, Copy, Lock } from 'lucide-react';
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

function InstallAgentStep() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(ARGO_MAKE_AUTHOR_INSTALL_CMD);
    setCopied(true);
    toast.success('Install command copied to clipboard.');
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li data-testid="studio-gate-step-agent">
      <p className="text-foreground text-sm font-medium">
        Install the {ARGO_MAKE_AUTHOR_AGENT_NAME} agent
      </p>
      <div className="border-border bg-muted mt-2 flex items-center gap-2 rounded-md border p-2">
        <code className="flex-1 overflow-x-auto font-mono text-xs whitespace-pre">
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
    </li>
  );
}

function AddMcpStep() {
  const { push } = useNamespacedNavigation();

  return (
    <li data-testid="studio-gate-step-mcp">
      <p className="text-foreground text-sm font-medium">
        Add the Kubernetes MCP server
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => push('/mcp')}
        data-testid="studio-gate-go-to-mcps">
        Go to MCPs
      </Button>
    </li>
  );
}

export function StudioChatGate({
  agentMissing,
  mcpMissing,
}: StudioChatGateProps) {
  return (
    <div
      className="bg-background/95 absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 text-center backdrop-blur-sm"
      data-testid="studio-chat-gate">
      <Lock className="text-muted-foreground h-8 w-8" />
      <div>
        <p className="text-foreground text-base font-semibold">
          Chat with the agent is locked
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Set up this namespace to start chatting with the builder agent:
        </p>
      </div>
      <ol className="flex w-full max-w-md flex-col gap-4 text-left">
        {agentMissing && <InstallAgentStep />}
        {mcpMissing && <AddMcpStep />}
      </ol>
    </div>
  );
}
