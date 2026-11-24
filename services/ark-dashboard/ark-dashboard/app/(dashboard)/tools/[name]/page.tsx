'use client';

import { useParams } from 'next/navigation';

import { ToolForm, ToolFormMode } from '@/components/forms/tool-form';

export default function ToolViewPage() {
  const params = useParams();
  const toolName = decodeURIComponent(params.name as string);

  return <ToolForm mode={ToolFormMode.VIEW} toolName={toolName} />;
}
