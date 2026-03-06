'use client';

import { useParams } from 'next/navigation';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function AgentEditPage() {
  const params = useParams();
  const { push } = useNamespacedNavigation();
  const agentName = params.name as string;

  return (
    <AgentForm
      mode={AgentFormMode.EDIT}
      agentName={agentName}
      onSuccess={() => push('/agents')}
    />
  );
}
