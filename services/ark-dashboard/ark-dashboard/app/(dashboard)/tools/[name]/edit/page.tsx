'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';

import { ToolForm, ToolFormMode } from '@/components/forms/tool-form';
import { toast } from '@/components/ui/sonner';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function ToolEditPage() {
  const params = useParams();
  const toolName = decodeURIComponent(params.name as string);
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    toast.success('Tool updated successfully');
    push(`/tools/${encodeURIComponent(toolName)}`);
  }, [push, toolName]);

  return (
    <ToolForm
      mode={ToolFormMode.EDIT}
      toolName={toolName}
      onSuccess={onSuccess}
    />
  );
}
