'use client';

import { useParams } from 'next/navigation';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';

export default function AgentViewPage() {
  const params = useParams();
  const agentName = decodeURIComponent(params.name as string);

  return <AgentForm mode={AgentFormMode.VIEW} agentName={agentName} />;
}
