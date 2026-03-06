'use client';

import { ExternalLink } from 'lucide-react';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

interface WorkflowLinkProps {
  workflowName: string;
}

export function WorkflowLink({ workflowName }: WorkflowLinkProps) {
  const { push } = useNamespacedNavigation();
  const sessionsUrl = `/sessions?workflowName=${encodeURIComponent(workflowName)}`;

  return (
    <a
      href={sessionsUrl}
      className="inline-flex items-center gap-1 underline"
      onClick={e => {
        e.preventDefault();
        push(sessionsUrl);
      }}>
      {workflowName}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
