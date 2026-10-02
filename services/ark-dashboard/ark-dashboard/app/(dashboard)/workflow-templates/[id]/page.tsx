'use client';

import { useParams } from 'next/navigation';

import { Spinner } from '@/components/ui/spinner';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';

export default function WorkflowTemplatePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { canUpdate, loading } = useWorkflowTemplateAccess();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="text-fg-secondary h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="-mx-12 -mt-10 -mb-5 flex min-h-0 flex-1 flex-col">
      <WorkflowStudio mode="edit" initialName={id} readOnly={!canUpdate} />
    </div>
  );
}
