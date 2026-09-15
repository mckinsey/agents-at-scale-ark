'use client';

import { useCallback } from 'react';

import { ToolForm, ToolFormMode } from '@/components/forms/tool-form';
import { toast } from '@/components/ui/sonner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function ToolNewPage() {
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    toast.success('Tool created successfully');
    push('/tools');
  }, [push]);

  return <ToolForm mode={ToolFormMode.CREATE} onSuccess={onSuccess} />;
}
