'use client';

import { ExternalLink, Lock } from 'lucide-react';

import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  ARGO_MAKE_AUTHOR_AGENT_NAME,
  ARGO_MAKE_AUTHOR_MARKETPLACE_URL,
  KUBERNETES_MCP_MARKETPLACE_URL,
  KUBERNETES_MCP_SERVER_NAME,
} from '@/lib/constants/argo-make';

interface StudioChatGateProps {
  agentMissing: boolean;
  agentNotReady: boolean;
  mcpMissing: boolean;
  mcpNotReady: boolean;
}

interface StepCardProps {
  step: number;
  title: string;
  testId: string;
  children: React.ReactNode;
}

function StepCard({ step, title, testId, children }: StepCardProps) {
  return (
    <li
      className="border-border flex flex-col items-center gap-3 border p-5 text-center"
      data-testid={testId}>
      <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium">
        {step}
      </span>
      <p className="text-foreground text-sm font-medium">{title}</p>
      {children}
    </li>
  );
}

interface ExternalLinkButtonProps {
  href: string;
  label: string;
  testId: string;
}

function ExternalLinkButton({ href, label, testId }: ExternalLinkButtonProps) {
  return (
    <Button asChild type="button" variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer" data-testid={testId}>
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

interface InternalLinkButtonProps {
  href: string;
  label: string;
  testId: string;
}

function InternalLinkButton({ href, label, testId }: InternalLinkButtonProps) {
  return (
    <Button asChild type="button" variant="outline" size="sm">
      <NamespacedLink href={href} data-testid={testId}>
        <ExternalLink className="h-4 w-4" />
        {label}
      </NamespacedLink>
    </Button>
  );
}

interface InstalledButtonProps {
  testId: string;
}

function InstalledButton({ testId }: InstalledButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      data-testid={testId}>
      Installed
    </Button>
  );
}

function AgentAction({
  agentMissing,
  agentNotReady,
}: {
  agentMissing: boolean;
  agentNotReady: boolean;
}) {
  if (agentMissing) {
    return (
      <div
        className="flex flex-col items-center gap-2"
        data-testid="studio-gate-step-agent-missing">
        <ExternalLinkButton
          href={ARGO_MAKE_AUTHOR_MARKETPLACE_URL}
          label="Install from marketplace"
          testId="studio-gate-agent-marketplace-link"
        />
      </div>
    );
  }

  if (agentNotReady) {
    return (
      <div
        className="flex flex-col items-center gap-2"
        data-testid="studio-gate-step-agent-not-ready">
        <p className="text-muted-foreground text-sm">
          Installed but not ready.
        </p>
        <InternalLinkButton
          href={`/agents/${ARGO_MAKE_AUTHOR_AGENT_NAME}`}
          label="Open agent"
          testId="studio-gate-go-to-agent"
        />
      </div>
    );
  }

  return <InstalledButton testId="studio-gate-item-agent-installed" />;
}

function McpAction({
  mcpMissing,
  mcpNotReady,
}: {
  mcpMissing: boolean;
  mcpNotReady: boolean;
}) {
  if (mcpMissing) {
    return (
      <div
        className="flex flex-col items-center gap-2"
        data-testid="studio-gate-step-mcp-missing">
        <ExternalLinkButton
          href={KUBERNETES_MCP_MARKETPLACE_URL}
          label="Install from marketplace"
          testId="studio-gate-mcp-marketplace-link"
        />
      </div>
    );
  }

  if (mcpNotReady) {
    return (
      <div
        className="flex flex-col items-center gap-2"
        data-testid="studio-gate-step-mcp-not-ready">
        <p className="text-muted-foreground text-sm">
          Installed but not ready.
        </p>
        <InternalLinkButton
          href="/mcp"
          label="Open MCP server"
          testId="studio-gate-go-to-mcp"
        />
      </div>
    );
  }

  return <InstalledButton testId="studio-gate-item-mcp-installed" />;
}

export function StudioChatGate({
  agentMissing,
  agentNotReady,
  mcpMissing,
  mcpNotReady,
}: StudioChatGateProps) {
  return (
    <div
      className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-6 backdrop-blur-sm"
      data-testid="studio-chat-gate">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 text-center">
        <Lock className="text-muted-foreground h-7 w-7" />
        <p className="text-foreground text-lg font-semibold">
          Chat not available
        </p>
        <p className="text-muted-foreground text-sm">
          Follow the steps below to start chatting with the{' '}
          {ARGO_MAKE_AUTHOR_AGENT_NAME} agent
        </p>
        <ol className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <StepCard
            step={1}
            title={`Install ${ARGO_MAKE_AUTHOR_AGENT_NAME} agent`}
            testId="studio-gate-item-agent">
            <AgentAction
              agentMissing={agentMissing}
              agentNotReady={agentNotReady}
            />
          </StepCard>
          <StepCard
            step={2}
            title={`Install ${KUBERNETES_MCP_SERVER_NAME}`}
            testId="studio-gate-item-mcp">
            <McpAction mcpMissing={mcpMissing} mcpNotReady={mcpNotReady} />
          </StepCard>
        </ol>
      </div>
    </div>
  );
}
