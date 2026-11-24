'use client';

import { useCallback } from 'react';

import { TeamForm, TeamFormMode } from '@/components/forms/team-form';
import { toast } from '@/components/ui/sonner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function TeamNewPage() {
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    toast.success('Team created successfully');
    push('/teams');
  }, [push]);

  return <TeamForm mode={TeamFormMode.CREATE} onSuccess={onSuccess} />;
}
