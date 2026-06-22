'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';

import { ToolForm, ToolFormMode } from '@/components/forms/tool-form';
import { toast } from '@/components/ui/sonner';

export default function ToolEditPage() {
  const params = useParams();
  const toolName = decodeURIComponent(params.name as string);

  const onSuccess = useCallback(() => {
    toast.success('Tool updated successfully');
  }, []);

  return (
    <ToolForm
      mode={ToolFormMode.EDIT}
      toolName={toolName}
      onSuccess={onSuccess}
    />
  );
}
