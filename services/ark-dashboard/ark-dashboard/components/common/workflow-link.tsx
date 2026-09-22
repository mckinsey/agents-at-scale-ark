'use client';

import { OpenInNew } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';

interface WorkflowLinkProps {
  readonly workflowName: string;
}

export function WorkflowLink({ workflowName }: WorkflowLinkProps) {
  const sessionsUrl = `/workflow-runs?workflowName=${encodeURIComponent(workflowName)}`;

  return (
    <NamespacedLink
      href={sessionsUrl}
      className="paragraph-regular-primary-link text-fg-secondary inline-flex items-center gap-1">
      {workflowName}
      <OpenInNew className="size-4" />
    </NamespacedLink>
  );
}
