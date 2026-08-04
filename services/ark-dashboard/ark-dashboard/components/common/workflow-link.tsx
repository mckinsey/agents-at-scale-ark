'use client';

import { OpenInNew } from '@/components/icons';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

interface WorkflowLinkProps {
  readonly workflowName: string;
}

export function WorkflowLink({ workflowName }: WorkflowLinkProps) {
  const { push } = useNamespacedNavigation();
  const sessionsUrl = `/workflow-runs?workflowName=${encodeURIComponent(workflowName)}`;

  return (
    <a
      href={sessionsUrl}
      className="paragraph-regular-primary-link text-fg-secondary inline-flex items-center gap-1"
      onClick={e => {
        e.preventDefault();
        push(sessionsUrl);
      }}>
      {workflowName}
      <OpenInNew className="size-4" />
    </a>
  );
}
