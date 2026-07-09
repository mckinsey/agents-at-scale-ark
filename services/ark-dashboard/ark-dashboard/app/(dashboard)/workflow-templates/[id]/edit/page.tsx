'use client';

import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';

import { NamespacedLink } from '@/components/namespaced-link';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';

export default function EditWorkflowTemplatePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { canUpdate, loading } = useWorkflowTemplateAccess();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!canUpdate) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-muted-foreground text-center">
          You don&apos;t have permission to edit workflow templates in this
          namespace.
        </p>
        <NamespacedLink
          href={`/workflow-templates/${id}`}
          className="text-sm underline">
          Back to workflow template
        </NamespacedLink>
      </div>
    );
  }

  return (
    <div className="-m-10 flex min-h-0 flex-1 flex-col">
      <WorkflowStudio mode="edit" initialName={id} />
    </div>
  );
}
