'use client';

import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface WorkflowLinkProps {
  workflowName: string;
}

export function WorkflowLink({ workflowName }: WorkflowLinkProps) {
  const router = useRouter();
  const sessionsUrl = `/sessions?workflowName=${encodeURIComponent(workflowName)}`;

  return (
    <a
      href={sessionsUrl}
      className="inline-flex items-center gap-1 underline"
      onClick={e => {
        e.preventDefault();
        router.push(sessionsUrl);
      }}>
      {workflowName}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
