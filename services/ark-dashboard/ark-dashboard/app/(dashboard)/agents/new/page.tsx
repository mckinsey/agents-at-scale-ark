'use client';

import { useRouter } from 'next/navigation';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';

export default function AgentNewPage() {
  const router = useRouter();

  return (
    <AgentForm
      mode={AgentFormMode.CREATE}
      onSuccess={() => router.push('/agents')}
    />
  );
}
