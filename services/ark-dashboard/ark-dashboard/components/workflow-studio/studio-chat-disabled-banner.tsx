'use client';

import { AlertTriangle } from 'lucide-react';

import { NamespacedLink } from '@/components/namespaced-link';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';

interface StudioChatDisabledBannerProps {
  agentNotReady: boolean;
  mcpNotReady: boolean;
}

interface ProblemBannerProps {
  message: string;
  href: string;
  testId: string;
  fixTestId: string;
}

function ProblemBanner({ message, href, testId, fixTestId }: ProblemBannerProps) {
  return (
    <Alert
      variant="warning"
      className="flex items-center gap-3"
      data-testid={testId}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="col-start-auto flex-1">{message}</AlertTitle>
      <NamespacedLink
        href={href}
        className="shrink-0 text-sm font-medium underline underline-offset-4"
        data-testid={fixTestId}>
        Fix now
      </NamespacedLink>
    </Alert>
  );
}

export function StudioChatDisabledBanner({
  agentNotReady,
  mcpNotReady,
}: StudioChatDisabledBannerProps) {
  return (
    <div
      className="flex flex-col gap-2 p-4"
      data-testid="studio-chat-disabled-banner">
      {agentNotReady && (
        <ProblemBanner
          message="Agent has a problem, please fix to use the chat"
          href={`/agents/${ARGO_MAKE_AUTHOR_AGENT_NAME}`}
          testId="studio-chat-disabled-banner-agent"
          fixTestId="studio-chat-disabled-banner-agent-fix"
        />
      )}
      {mcpNotReady && (
        <ProblemBanner
          message="k8s mcp server has a problem, fix to use the chat"
          href="/mcp"
          testId="studio-chat-disabled-banner-mcp"
          fixTestId="studio-chat-disabled-banner-mcp-fix"
        />
      )}
    </div>
  );
}
