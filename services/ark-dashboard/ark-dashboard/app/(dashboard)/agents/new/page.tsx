'use client';

import { useCallback } from 'react';

import { AgentForm, AgentFormMode } from '@/components/forms/agent-form';
import { toast } from '@/components/ui/sonner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function AgentNewPage() {
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    toast.success('Agent created successfully');
    push('/agents');
  }, [push]);

  return <AgentForm mode={AgentFormMode.CREATE} onSuccess={onSuccess} />;
}
