'use client';

import { useParams, useRouter } from 'next/navigation';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';

export default function AgentEditPage() {
  const params = useParams();
  const router = useRouter();
  const agentName = params.name as string;

  return (
    <AgentForm
      mode={AgentFormMode.EDIT}
      agentName={agentName}
      onSuccess={() => router.push('/agents')}
    />
  );
}
